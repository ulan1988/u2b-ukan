// Логика листа «Деньги». Всё по ID; проведение создаёт payments (бьёт в акт сверки).
import * as fin from '../repositories/fin.repo'

const num = (n: any) => Number(n) || 0
const sumAmounts = (amts: any[]) => (amts || []).reduce((s, a) => s + num(a.amount), 0)

// Полный день: счета, начальный/конечный остаток по счетам, строки, список дней, избранные.
export async function financeDay(orgId: string, date: string) {
  const [accts, opening, rows, dates, favs, expArticles, autoPays, okind] = await Promise.all([
    fin.cashdayAccounts(orgId), fin.openingByAccount(orgId, date), fin.rowsForDay(orgId, date), fin.datesForOrg(orgId), fin.favorites(orgId), fin.expenseArticles(orgId), fin.autoFinPayments(orgId), fin.orgKind(orgId),
  ])
  const isHq = (okind?.[0]?.kind || '') === 'hq'
  const open: Record<string, number> = {}
  for (const a of accts) open[a.id] = 0
  for (const o of opening) open[o.id] = o.amt

  // ── АВТО-строки: платежи орг без fin_row_id (инкассации филиалов, оплаты клиентов из кабинета,
  // ручные, погашения, поставщики). В БД листа НЕ пишем. ОДНА строка на контрагента: суммы
  // раскидываются по колонкам-счетам (Еркебулан = Каспи 200к + Наличные 50к в одной строке).
  // Колонка = РЕАЛЬНЫЙ счёт платежа (как в базе, без принуждения). 7 ФИКС-строк всегда видны
  // (даже пустые) — держат структуру листа; прочие контрагенты — ниже; ручные строки — в конце.
  const cashdayIds = new Set(accts.map(a => a.id))
  const low = (s: any) => String(s || '').toLowerCase()
  const bankId = accts.find(a => low(a.name).includes('банков'))?.id || accts.find(a => a.kind === 'bank')?.id || null
  const opFav = favs.find((f: any) => low(f.label).includes('оплата от покупател'))
  const spFav = favs.find((f: any) => low(f.label).includes('поставщ'))
  const opArt = { code: opFav?.code || null, article: opFav?.label || 'Оплата от покупателей' }   // приход
  const spArt = { code: spFav?.code || null, article: spFav?.label || 'Оплата поставщику' }        // расход
  const colOf = (p: any) => (p.cashAccountId && cashdayIds.has(p.cashAccountId)) ? p.cashAccountId : bankId
  const artOf = (p: any) => p.direction === 'in' ? opArt : spArt

  // Прошлые дни → в остаток на начало; платежи дня → todayPays.
  const todayPays: any[] = []
  for (const p of autoPays) {
    const col = colOf(p); if (!col) continue
    const signed = (p.direction === 'in' ? 1 : -1) * num(p.amount)
    if (p.date < date) { open[col] = (open[col] || 0) + signed; continue }
    if (p.date === date) todayPays.push({ ...p, col, signed })
  }

  let autoRows: any[]
  if (isHq) {
    // ГОЛОВНОЙ: 7 фикс-слотов (всегда видны, в этом порядке) + прочие контрагенты ниже.
    // slotOf: клиентов (имена) проверяем ДО «базар/жанар», иначе «Еркебулан Жанар базар» уедет к Базару.
    const SLOTS = ['Магазин Кристалл', 'Нипа листогиб', 'Базар Нипа', 'Базар Нипа (Жанар Базар)', 'Еркебулан Жанар базар', 'Жаркын Туркестан', 'Абай Нурмаханов']
    const slotOf = (name: string) => { const n = low(name)
      if (n.includes('кристалл')) return 0
      if (n.includes('листогиб')) return 1
      if (n.includes('еркебулан')) return 4
      if (n.includes('жаркын') || n.includes('туркист') || n.includes('туркест')) return 5
      if (n.includes('абай') || n.includes('нурмахан')) return 6
      if (n.includes('базар') || n.includes('жанар')) return 2
      return -1 }
    const slotAmt: Array<Record<string, number>> = SLOTS.map(() => ({}))
    const slotCag: Array<{ id: string | null; doc: string | null }> = SLOTS.map(() => ({ id: null, doc: null }))
    const others = new Map<string, any>()
    for (const p of todayPays) {
      const s = slotOf(p.contragent)
      if (s >= 0) {
        slotAmt[s][p.col] = (slotAmt[s][p.col] || 0) + p.signed
        if (!slotCag[s].id && p.contragentId) slotCag[s].id = p.contragentId
        if (!slotCag[s].doc && p.docNumber) slotCag[s].doc = p.docNumber
      } else {
        const key = (p.contragentId || 'x') + '|' + p.direction
        let g = others.get(key)
        if (!g) { g = { contragentId: p.contragentId, contragent: p.contragent, direction: p.direction, amt: {} as Record<string, number>, doc: null as string | null }; others.set(key, g) }
        g.amt[p.col] = (g.amt[p.col] || 0) + p.signed
        if (p.docNumber && !g.doc) g.doc = p.docNumber
      }
    }
    const fixedRows = SLOTS.map((label, i) => ({ id: `auto-slot-${i}`, auto: true, status: 'posted', type: 'in', code: opArt.code, article: opArt.article, who: '', contragent: label, contragentId: slotCag[i].id, docId: null, docNumber: slotCag[i].doc, comment: '', alloc: [], amounts: Object.entries(slotAmt[i]).map(([accountId, amount]) => ({ accountId, amount })) }))
    const otherRows = Array.from(others.values()).sort((a, b) => low(a.contragent).localeCompare(low(b.contragent)))
      .map(g => { const a = g.direction === 'in' ? opArt : spArt
        return { id: `auto-${g.contragentId || 'x'}-${g.direction}`, auto: true, status: 'posted', type: g.direction === 'in' ? 'in' : 'out', code: a.code, article: a.article, who: '', contragent: g.contragent || '', contragentId: g.contragentId, docId: null, docNumber: g.doc, comment: '', alloc: [], amounts: Object.entries(g.amt).map(([accountId, amount]) => ({ accountId, amount })) } })
    autoRows = [...fixedRows, ...otherRows]
  } else {
    // ФИЛИАЛ/МАГАЗИН: строка на КАЖДЫЙ платёж (кассовый ордер) с привязкой к накладной (docNumber).
    autoRows = todayPays.map(p => { const a = artOf(p)
      return { id: `auto-${p.id}`, auto: true, status: 'posted', type: p.direction === 'in' ? 'in' : 'out', code: a.code, article: a.article, who: '', contragent: p.contragent || '', contragentId: p.contragentId, docId: p.docId || null, docNumber: p.docNumber || null, comment: p.comment || '', alloc: [], amounts: [{ accountId: p.col, amount: p.signed }] } })
  }
  const allRows = [...autoRows, ...rows]   // авто-строки сверху, ручные — в конце

  const closing: Record<string, number> = { ...open }
  for (const r of allRows) for (const am of (r.amounts || [])) closing[am.accountId] = (closing[am.accountId] || 0) + num(am.amount)
  // Дни = дни листа + дни авто-платежей (чтобы день инкассации был в выборе) + текущий.
  const dl = Array.from(new Set([date, ...dates.map(d => d.date), ...autoPays.map(p => p.date)])).sort((a, b) => a < b ? 1 : -1)
  return { accounts: accts, opening: open, closing, rows: allRows, dates: dl, favorites: favs, expenseArticles: expArticles }
}

// Создать/обновить строку + её суммы по счетам. Правка только черновика.
export async function saveFinRow(orgId: string, input: any) {
  let id: string = input.id
  const fields = { type: input.type || 'etc', code: input.code || null, article: input.article || '', who: input.who || '', comment: input.comment ?? null, contragentId: input.contragentId || null, docId: input.docId || null, expenseArticleId: input.expenseArticleId || null }
  if (id) {
    await fin.updateRowFields(id, input.date ? { ...fields, date: input.date } : fields)
  } else {
    const sort = (await fin.maxSort(orgId, input.date)) + 1
    const [r] = await fin.insertRow({ orgId, date: input.date, sortOrder: input.sortOrder ?? sort, status: 'draft', ...fields } as any)
    id = r.id
  }
  await fin.deleteAmounts(id)
  const vals = (input.amounts || []).filter((a: any) => num(a.amount)).map((a: any) => ({ rowId: id, accountId: a.accountId, amount: String(num(a.amount)) }))
  await fin.insertAmounts(vals as any)
  // Погашение накладных (пусто = предоплата/аванс).
  if (Array.isArray(input.alloc)) {
    await fin.deleteAlloc(id)
    const av = input.alloc.filter((a: any) => a.docId && num(a.amount)).map((a: any) => ({ rowId: id, docId: a.docId, amount: String(num(a.amount)) }))
    await fin.insertAlloc(av as any)
  }
  return { ok: true, id }
}

export async function deleteFinRow(id: string) { await fin.deleteRow(id); return { ok: true } }

// Порядок строк дня: sort_order = индекс.
export async function reorderDay(orderedIds: string[]) {
  await Promise.all(orderedIds.map((id, i) => fin.setSort(id, i + 1)))
  return { ok: true }
}

// Провести платежи: черновые строки с суммами → posted; для строк с контрагентом
// (кроме перемещения) создаётся оплата (payment) → отражается в акте сверки.
export async function postFinDay(orgId: string, date: string, actorId?: string) {
  const rows = await fin.rowsForDay(orgId, date)
  const drafts = rows.filter(r => r.status !== 'posted' && sumAmounts(r.amounts) !== 0)
  let paid = 0
  for (const r of drafts) paid += await applyRowPayments(orgId, r, date, actorId)
  await fin.setPosted(drafts.map(r => r.id))
  return { ok: true, posted: drafts.length, payments: paid }
}

export const searchDocs = (orgId: string, q: string) => fin.docSearch(orgId, q || '')
// Открытые накладные контрагента для погашения: kind out→ поставщику (приходные), in→ от клиента (расходные).
export const openInvoices = (orgId: string, contragentId: string, dir: string) =>
  fin.contragentOpenInvoices(orgId, contragentId, dir === 'in' ? 'sale' : 'purchase')
export const listFinFavorites = (orgId: string) => fin.favorites(orgId)
export const listExpenseArticles = (orgId: string) => fin.expenseArticles(orgId)
export async function saveExpenseArticles(orgId: string, items: any[]) {
  await fin.archiveExpenseArticles(orgId)   // мягко: старые id остаются валидны для прошлых строк
  const vals = (items || []).map((x: any, i: number) => ({ orgId, code: x.code || null, name: x.name || '', sortOrder: i, archived: false }))
  await fin.insertExpenseArticles(vals as any)
  return { ok: true }
}

// Отчёт ДДС за период: деятельности → Поступления/Платежи по статьям + остатки по счетам.
const ACT_TITLES: Record<string, string> = { operating: 'Операционная деятельность', financial: 'Финансовая деятельность', investing: 'Инвестиционная деятельность' }
export async function ddsReport(orgId: string, from: string, to: string) {
  const [rows, accts, opening, net] = await Promise.all([
    fin.ddsRows(orgId, from, to), fin.accounts(orgId), fin.openingByAccount(orgId, from), fin.periodNetByAccount(orgId, from, to),
  ])
  const activities = Object.keys(ACT_TITLES).map(key => {
    const items = rows.filter(r => r.activity === key)
    const inflows = items.filter(r => r.inflow > 0).map(r => ({ code: r.code, label: r.article, sum: r.inflow }))
    const outflows = items.filter(r => r.outflow > 0).map(r => ({ code: r.code, label: r.article, sum: r.outflow }))
    return { key, title: ACT_TITLES[key], inflows, outflows, inTotal: inflows.reduce((s, x) => s + x.sum, 0), outTotal: outflows.reduce((s, x) => s + x.sum, 0) }
  }).filter(a => a.inflows.length || a.outflows.length)

  const totalIn = activities.reduce((s, a) => s + a.inTotal, 0)
  const totalOut = activities.reduce((s, a) => s + a.outTotal, 0)
  const openMap: Record<string, number> = {}; accts.forEach(a => openMap[a.id] = 0); opening.forEach(o => openMap[o.id] = o.amt)
  const netMap: Record<string, number> = {}; net.forEach(o => netMap[o.id] = o.amt)
  const closeMap: Record<string, number> = {}; accts.forEach(a => closeMap[a.id] = (openMap[a.id] || 0) + (netMap[a.id] || 0))
  return { activities, totalIn, totalOut, netFlow: totalIn - totalOut, accounts: accts, opening: openMap, closing: closeMap }
}

// Создать платежи по строке (провести): mv/service/без контрагента — не платят.
async function applyRowPayments(orgId: string, r: any, date: string, actorId?: string) {
  const total = sumAmounts(r.amounts)
  if (r.type === 'mv' || r.type === 'service' || !r.contragentId || total === 0) return 0
  const dir = total >= 0 ? 'in' : 'out'
  const acc = (r.amounts || []).slice().sort((a: any, b: any) => Math.abs(num(b.amount)) - Math.abs(num(a.amount)))[0]
  const allocs = (r.alloc || []).filter((a: any) => num(a.amount))
  if (allocs.length) {
    for (const a of allocs) {
      await fin.insertPayment({ orgId, contragentId: r.contragentId, direction: dir, amount: String(Math.abs(num(a.amount))), date, cashAccountId: acc?.accountId || null, documentId: a.docId, finRowId: r.id, comment: `Деньги · погашение ${a.number || ''}`.trim(), createdBy: actorId || null } as any)
      await fin.bumpPaidSum(a.docId, Math.abs(num(a.amount)))
    }
    return allocs.length
  }
  await fin.insertPayment({ orgId, contragentId: r.contragentId, direction: dir, amount: String(Math.abs(total)), date, cashAccountId: acc?.accountId || null, finRowId: r.id, comment: `Деньги · ${r.article}${r.who ? ' · ' + r.who : ''}`, createdBy: actorId || null } as any)
  return 1
}

// Сторно эффектов проведённой строки: откат paid_sum по погашениям + удаление её платежей.
async function revertRowEffects(rowId: string) {
  const allocs = await fin.allocForRow(rowId)
  for (const a of allocs) await fin.bumpPaidSum(a.docId, -num(a.amount))
  await fin.deletePaymentsForRow(rowId)
}

// Режим «Финанс» Уканбана: счета орг + движения за период + остатки (начало/конец).
export async function financeLedger(orgId: string, from: string, to: string) {
  const f = from || '2000-01-01', t = to || '2100-01-01'
  const [accts, moves, opening] = await Promise.all([
    fin.accounts(orgId), fin.ledgerMovements(orgId, f, t), fin.ledgerOpening(orgId, f),
  ])
  const open: Record<string, number> = {}; for (const a of accts) open[a.id] = 0
  for (const o of opening) open[o.acc] = o.amt
  const close: Record<string, number> = { ...open }
  for (const m of moves) close[m.acc] = (close[m.acc] || 0) + num(m.amount)
  return { accounts: accts, movements: moves, opening: open, closing: close }
}

// Журнал документов (проведённые операции за период) + счета для колонок.
// Включает и ручные строки (fin_rows), и АВТО-операции (платежи без fin_row_id:
// инкассации, оплаты из кабинета, ручные платежи, погашения, поставщики) — как в 1С.
export async function financeJournal(orgId: string, from: string, to: string) {
  const [rows, accts, autoPays, favs] = await Promise.all([
    fin.journalRows(orgId, from, to), fin.accounts(orgId), fin.autoFinPayments(orgId), fin.favorites(orgId),
  ])
  const low = (s: any) => String(s || '').toLowerCase()
  const opFav = favs.find((f: any) => low(f.label).includes('оплата от покупател'))
  const spFav = favs.find((f: any) => low(f.label).includes('поставщ'))
  const opArt = { code: opFav?.code || null, article: opFav?.label || 'Оплата от покупателей' }
  const spArt = { code: spFav?.code || null, article: spFav?.label || 'Оплата поставщику' }
  const autoRows = autoPays
    .filter((p: any) => p.date >= from && p.date <= to)
    .map((p: any) => { const a = p.direction === 'in' ? opArt : spArt; const signed = (p.direction === 'in' ? 1 : -1) * num(p.amount)
      return { id: `auto-${p.id}`, auto: true, date: p.date, type: p.direction === 'in' ? 'in' : 'out', code: a.code, article: a.article, who: '', contragent: p.contragent || '', contragentId: p.contragentId, comment: p.comment || '', docId: p.docId || null, docNumber: p.docNumber || null, amounts: p.cashAccountId ? [{ accountId: p.cashAccountId, amount: signed }] : [] } })
  const all = [...rows.map((r: any) => ({ ...r, auto: false })), ...autoRows].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  return { rows: all, accounts: accts }
}

// Правка документа: если был проведён — сторнируем эффекты, применяем правки, проводим заново.
export async function editDoc(orgId: string, id: string, input: any, actorId?: string) {
  const [old] = await fin.rowById(id)
  if (!old) return { ok: false, error: 'Строка не найдена' }
  const wasPosted = old.status === 'posted'
  if (wasPosted) await revertRowEffects(id)
  await saveFinRow(orgId, { ...input, id })
  if (wasPosted) {
    const [nr] = await fin.rowById(id)
    const alloc = await fin.allocForRow(id)
    await applyRowPayments(orgId, { ...nr, id, alloc }, input.date || old.date, actorId)
  }
  return { ok: true }
}

// Удаление документа: сторно эффектов + удаление строки (каскадом суммы/погашения).
export async function deleteDocFull(id: string) {
  await revertRowEffects(id)
  await fin.deleteRow(id)
  return { ok: true }
}

export async function saveFinFavorites(orgId: string, favs: any[]) {
  await fin.clearFavorites(orgId)
  const vals = (favs || []).map((f: any, i: number) => ({ orgId, code: f.code || null, label: f.label || '', type: f.type || 'etc', activity: f.activity || null, contragentId: f.contragentId || null, defaultAccountId: f.defaultAccountId || null, sortOrder: i }))
  await fin.insertFavorites(vals as any)
  return { ok: true }
}

// Добавить в день недостающие строки из избранного (по статье).
export async function applyFavorites(orgId: string, date: string) {
  const [favs, rows] = await Promise.all([fin.favorites(orgId), fin.rowsForDay(orgId, date)])
  const have = new Set(rows.map(r => r.article))
  let base = await fin.maxSort(orgId, date)
  let added = 0
  for (const f of favs) {
    if (have.has(f.label)) continue
    base++
    await fin.insertRow({ orgId, date, sortOrder: base, status: 'draft', type: f.type || 'etc', code: f.code || null, article: f.label || '', who: '', contragentId: f.contragentId || null } as any)
    added++
  }
  return { ok: true, added }
}
