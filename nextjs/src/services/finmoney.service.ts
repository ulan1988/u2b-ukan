// Логика листа «Деньги». Всё по ID; проведение создаёт payments (бьёт в акт сверки).
import * as fin from '../repositories/fin.repo'

const num = (n: any) => Number(n) || 0
const sumAmounts = (amts: any[]) => (amts || []).reduce((s, a) => s + num(a.amount), 0)

// Полный день: счета, начальный/конечный остаток по счетам, строки, список дней, избранные.
export async function financeDay(orgId: string, date: string) {
  const [accts, opening, rows, dates, favs, expArticles, autoPays] = await Promise.all([
    fin.cashdayAccounts(orgId), fin.openingByAccount(orgId, date), fin.rowsForDay(orgId, date), fin.datesForOrg(orgId), fin.favorites(orgId), fin.expenseArticles(orgId), fin.autoFinPayments(orgId),
  ])
  const open: Record<string, number> = {}
  for (const a of accts) open[a.id] = 0
  for (const o of opening) open[o.id] = o.amt

  // ── АВТО-строки: платежи орг без fin_row_id (инкассации филиалов, оплаты клиентов из кабинета,
  // ручные, погашения, поставщики). В БД листа НЕ пишем. ОДНА строка на контрагента: суммы
  // раскидываются по колонкам-счетам (Еркебулан = Каспи 200к + Наличные 50к в одной строке).
  // Колонка = РЕАЛЬНЫЙ счёт платежа (как в базе, без принуждения). Приход → «Оплата от
  // покупателей», расход → «Оплата поставщику». Порядок строк — фикс (RANK), прочие — после.
  const cashdayIds = new Set(accts.map(a => a.id))
  const low = (s: any) => String(s || '').toLowerCase()
  const bankId = accts.find(a => low(a.name).includes('банков'))?.id || accts.find(a => a.kind === 'bank')?.id || null
  const opFav = favs.find((f: any) => low(f.label).includes('оплата от покупател'))
  const spFav = favs.find((f: any) => low(f.label).includes('поставщ'))
  const opArt = { code: opFav?.code || null, article: opFav?.label || 'Оплата от покупателей' }   // приход
  const spArt = { code: spFav?.code || null, article: spFav?.label || 'Оплата поставщику' }        // расход
  const colOf = (p: any) => (p.cashAccountId && cashdayIds.has(p.cashAccountId)) ? p.cashAccountId : bankId
  // Фикс-порядок: 1 Кристалл · 2 Нипа листогиб · 3 Базар Нипа · 4 (Жанар) · 5 Еркебулан · 6 Жаркын · 7 Абай.
  // Клиентов (имена) проверяем ДО «базар/жанар», иначе «Еркебулан Жанар базар» уедет к Базару.
  const rankOf = (name: string) => { const n = low(name)
    if (n.includes('кристалл')) return 1
    if (n.includes('листогиб')) return 2
    if (n.includes('еркебулан')) return 5
    if (n.includes('жаркын') || n.includes('туркист') || n.includes('туркест')) return 6
    if (n.includes('абай') || n.includes('нурмахан')) return 7
    if (n.includes('базар') || n.includes('жанар')) return 3
    return 99 }
  // Группируем по контрагенту+направлению; суммы складываем по счёту.
  const groups = new Map<string, any>()
  for (const p of autoPays) {
    const col = colOf(p); if (!col) continue
    const signed = (p.direction === 'in' ? 1 : -1) * num(p.amount)
    if (p.date < date) { open[col] = (open[col] || 0) + signed; continue }   // прошлые → в остаток на начало
    if (p.date !== date) continue
    const key = (p.contragentId || 'x') + '|' + p.direction
    let g = groups.get(key)
    if (!g) { g = { contragentId: p.contragentId, contragent: p.contragent, direction: p.direction, rank: rankOf(p.contragent), amt: {} as Record<string, number>, docNumber: null as string | null }; groups.set(key, g) }
    g.amt[col] = (g.amt[col] || 0) + signed
    if (p.docNumber && !g.docNumber) g.docNumber = p.docNumber
  }
  const autoRows = Array.from(groups.values())
    .sort((a, b) => a.rank - b.rank || low(a.contragent).localeCompare(low(b.contragent)))
    .map(g => { const a = g.direction === 'in' ? opArt : spArt
      return { id: `auto-${g.contragentId || 'x'}-${g.direction}`, auto: true, status: 'posted', type: g.direction === 'in' ? 'in' : 'out', code: a.code, article: a.article, who: '', contragent: g.contragent || '', contragentId: g.contragentId, docId: null, docNumber: g.docNumber, comment: '', alloc: [], amounts: Object.entries(g.amt).map(([accountId, amount]) => ({ accountId, amount })) } })
  const allRows = [...autoRows, ...rows]   // авто-строки (фикс-порядок) сверху, ручные ниже

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

// Журнал документов (проведённые операции за период) + счета для колонок.
export async function financeJournal(orgId: string, from: string, to: string) {
  const [rows, accts] = await Promise.all([fin.journalRows(orgId, from, to), fin.accounts(orgId)])
  return { rows, accounts: accts }
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
