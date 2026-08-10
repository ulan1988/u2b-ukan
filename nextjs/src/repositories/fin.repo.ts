// Финанс «Деньги»: дневной кассовый лист. Чтение — sqlClient, запись — drizzle.
import { db, sqlClient } from '../lib/db'
import { finRows, finRowAmounts, finFavorites, payments } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'

export const accounts = (orgId: string) =>
  sqlClient`select id::text, name, kind from cash_accounts where org_id=${orgId} and archived=false order by kind desc, name` as unknown as Promise<Array<{ id: string; name: string; kind: string }>>

// Начальный остаток на дату = сумма проведённых сумм по счёту за дни ДО date.
export const openingByAccount = (orgId: string, date: string) =>
  sqlClient`select a.account_id::text id, coalesce(sum(a.amount),0)::float amt
    from fin_row_amounts a join fin_rows r on r.id=a.row_id
    where r.org_id=${orgId} and r.status='posted' and r.date < ${date}
    group by a.account_id` as unknown as Promise<Array<{ id: string; amt: number }>>

export const rowsForDay = (orgId: string, date: string) =>
  sqlClient`select r.id::text, r.type, r.code, r.article, r.who, r.status, r.sort_order "sortOrder",
      r.contragent_id::text "contragentId", r.doc_id::text "docId",
      c.name "contragent", d.number "docNumber", d.type "docType",
      coalesce(json_agg(json_build_object('accountId', am.account_id::text, 'amount', am.amount::float)) filter (where am.id is not null), '[]') amounts
    from fin_rows r
    left join contragents c on c.id=r.contragent_id
    left join documents d on d.id=r.doc_id
    left join fin_row_amounts am on am.row_id=r.id
    where r.org_id=${orgId} and r.date=${date}
    group by r.id, c.name, d.number, d.type
    order by r.sort_order, r.created_at` as unknown as Promise<any[]>

export const datesForOrg = (orgId: string) =>
  sqlClient`select distinct date::text as date from fin_rows where org_id=${orgId} order by date desc` as unknown as Promise<Array<{ date: string }>>

export const favorites = (orgId: string) =>
  sqlClient`select id::text, code, label, type, activity, contragent_id::text "contragentId", default_account_id::text "defaultAccountId", sort_order "sortOrder"
    from fin_favorites where org_id=${orgId} order by sort_order, label` as unknown as Promise<any[]>

export const rowById = (id: string) =>
  sqlClient`select r.id::text, r.type, r.article, r.who, r.status, r.date::text, r.contragent_id::text "contragentId", r.doc_id::text "docId",
      coalesce(json_agg(json_build_object('accountId', am.account_id::text, 'amount', am.amount::float)) filter (where am.id is not null), '[]') amounts
    from fin_rows r left join fin_row_amounts am on am.row_id=r.id
    where r.id=${id} group by r.id` as unknown as Promise<any[]>

export const maxSort = async (orgId: string, date: string) => {
  const r = await sqlClient`select coalesce(max(sort_order),0)::int m from fin_rows where org_id=${orgId} and date=${date}` as unknown as Array<{ m: number }>
  return r[0]?.m ?? 0
}

export const insertRow = (row: typeof finRows.$inferInsert) => db.insert(finRows).values(row).returning({ id: finRows.id })
export const updateRowFields = (id: string, patch: Partial<typeof finRows.$inferInsert>) => db.update(finRows).set(patch).where(eq(finRows.id, id))
export const deleteRow = (id: string) => db.delete(finRows).where(eq(finRows.id, id))
export const deleteAmounts = (rowId: string) => db.delete(finRowAmounts).where(eq(finRowAmounts.rowId, rowId))
export const insertAmounts = (vals: typeof finRowAmounts.$inferInsert[]) => vals.length ? db.insert(finRowAmounts).values(vals) : Promise.resolve()
export const setPosted = (ids: string[]) => ids.length ? db.update(finRows).set({ status: 'posted' }).where(inArray(finRows.id, ids)) : Promise.resolve()
export const setSort = (id: string, sort: number) => db.update(finRows).set({ sortOrder: sort }).where(eq(finRows.id, id))

export const clearFavorites = (orgId: string) => db.delete(finFavorites).where(eq(finFavorites.orgId, orgId))
export const insertFavorites = (vals: typeof finFavorites.$inferInsert[]) => vals.length ? db.insert(finFavorites).values(vals) : Promise.resolve()

export const insertPayment = (val: typeof payments.$inferInsert) => db.insert(payments).values(val)

// Поиск документов для привязки в строке (номер/контрагент).
export const docSearch = (orgId: string, q: string) =>
  sqlClient`select d.id::text, d.number, d.type, d.total::float total, d.date::text, c.name contragent
    from documents d left join contragents c on c.id=d.contragent_id
    where d.org_id=${orgId} and d.status<>'cancelled'
      and (${q} = '' or d.number ilike ${'%' + q + '%'} or c.name ilike ${'%' + q + '%'})
    order by d.created_at desc limit 30` as unknown as Promise<any[]>

