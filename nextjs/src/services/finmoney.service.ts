// Логика листа «Деньги». Всё по ID; проведение создаёт payments (бьёт в акт сверки).
import * as fin from '../repositories/fin.repo'

const num = (n: any) => Number(n) || 0
const sumAmounts = (amts: any[]) => (amts || []).reduce((s, a) => s + num(a.amount), 0)

// Полный день: счета, начальный/конечный остаток по счетам, строки, список дней, избранные.
export async function financeDay(orgId: string, date: string) {
  const [accts, opening, rows, dates, favs] = await Promise.all([
    fin.accounts(orgId), fin.openingByAccount(orgId, date), fin.rowsForDay(orgId, date), fin.datesForOrg(orgId), fin.favorites(orgId),
  ])
  const open: Record<string, number> = {}
  for (const a of accts) open[a.id] = 0
  for (const o of opening) open[o.id] = o.amt
  const closing: Record<string, number> = { ...open }
  for (const r of rows) for (const am of (r.amounts || [])) closing[am.accountId] = (closing[am.accountId] || 0) + num(am.amount)
  const dl = dates.map(d => d.date)
  if (!dl.includes(date)) dl.unshift(date)
  return { accounts: accts, opening: open, closing, rows, dates: dl, favorites: favs }
}

// Создать/обновить строку + её суммы по счетам. Правка только черновика.
export async function saveFinRow(orgId: string, input: any) {
  let id: string = input.id
  const fields = { type: input.type || 'etc', article: input.article || '', who: input.who || '', contragentId: input.contragentId || null, docId: input.docId || null }
  if (id) {
    await fin.updateRowFields(id, fields)
  } else {
    const sort = (await fin.maxSort(orgId, input.date)) + 1
    const [r] = await fin.insertRow({ orgId, date: input.date, sortOrder: input.sortOrder ?? sort, status: 'draft', ...fields } as any)
    id = r.id
  }
  await fin.deleteAmounts(id)
  const vals = (input.amounts || []).filter((a: any) => num(a.amount)).map((a: any) => ({ rowId: id, accountId: a.accountId, amount: String(num(a.amount)) }))
  await fin.insertAmounts(vals as any)
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
  for (const r of drafts) {
    const total = sumAmounts(r.amounts)
    if (r.type !== 'mv' && r.contragentId && total !== 0) {
      // счёт оплаты = где сумма по модулю максимальная
      const acc = (r.amounts || []).slice().sort((a: any, b: any) => Math.abs(num(b.amount)) - Math.abs(num(a.amount)))[0]
      await fin.insertPayment({
        orgId, contragentId: r.contragentId, direction: total >= 0 ? 'in' : 'out',
        amount: String(Math.abs(total)), date, cashAccountId: acc?.accountId || null,
        comment: `Деньги · ${r.article}${r.who ? ' · ' + r.who : ''}`, createdBy: actorId || null,
      } as any)
      paid++
    }
  }
  await fin.setPosted(drafts.map(r => r.id))
  return { ok: true, posted: drafts.length, payments: paid }
}

export const searchDocs = (orgId: string, q: string) => fin.docSearch(orgId, q || '')
export const listFinFavorites = (orgId: string) => fin.favorites(orgId)

export async function saveFinFavorites(orgId: string, favs: any[]) {
  await fin.clearFavorites(orgId)
  const vals = (favs || []).map((f: any, i: number) => ({ orgId, label: f.label || '', type: f.type || 'etc', contragentId: f.contragentId || null, sortOrder: i }))
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
    await fin.insertRow({ orgId, date, sortOrder: base, status: 'draft', type: f.type || 'etc', article: f.label || '', who: '', contragentId: f.contragentId || null } as any)
    added++
  }
  return { ok: true, added }
}
