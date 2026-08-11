// Финанс «Деньги»: дневной кассовый лист. Чтение — sqlClient, запись — drizzle.
import { db, sqlClient } from '../lib/db'
import { finRows, finRowAmounts, finRowAlloc, finFavorites, finExpenseArticles, payments, documents } from '../db/schema'
import { eq, inArray, sql as dsql } from 'drizzle-orm'

// Неоплаченные накладные контрагента (для погашения платежом).
// Оплата поставщику гасит приходные (наши закупы у него); от клиента — расходные.
export const contragentOpenInvoices = (orgId: string, contragentId: string, kind: 'purchase' | 'sale') =>
  sqlClient`select id::text, number, date::text, total::float total, paid_sum::float paid,
      (total - paid_sum)::float outstanding
    from documents
    where org_id=${orgId} and contragent_id=${contragentId} and type=${kind} and status<>'cancelled'
      and (total - paid_sum) > 0
    order by date, created_at` as unknown as Promise<any[]>

export const bumpPaidSum = (docId: string, delta: number) =>
  db.update(documents).set({ paidSum: dsql`${documents.paidSum} + ${String(delta)}`, updatedAt: new Date() }).where(eq(documents.id, docId))

export const accounts = (orgId: string) =>
  sqlClient`select id::text, name, kind from cash_accounts where org_id=${orgId} and archived=false order by sort_order, name` as unknown as Promise<Array<{ id: string; name: string; kind: string }>>

// Справочник статей затрат (для расходных строк).
export const expenseArticles = (orgId: string) =>
  sqlClient`select id::text, code, name, sort_order "sortOrder" from fin_expense_articles where org_id=${orgId} and archived=false order by code, sort_order, name` as unknown as Promise<any[]>

// Начальный остаток на дату = сумма проведённых сумм по счёту за дни ДО date.
export const openingByAccount = (orgId: string, date: string) =>
  sqlClient`select a.account_id::text id, coalesce(sum(a.amount),0)::float amt
    from fin_row_amounts a join fin_rows r on r.id=a.row_id
    where r.org_id=${orgId} and r.status='posted' and r.date < ${date}
    group by a.account_id` as unknown as Promise<Array<{ id: string; amt: number }>>

export const rowsForDay = (orgId: string, date: string) =>
  sqlClient`select r.id::text, r.type, r.code, r.article, r.who, r.comment, r.status, r.sort_order "sortOrder",
      r.contragent_id::text "contragentId", r.doc_id::text "docId",
      r.expense_article_id::text "expenseArticleId", ea.code "expCode", ea.name "expName",
      c.name "contragent", d.number "docNumber", d.type "docType",
      coalesce((select json_agg(json_build_object('docId', al.doc_id::text, 'number', dd.number, 'amount', al.amount::float)) from fin_row_alloc al join documents dd on dd.id=al.doc_id where al.row_id=r.id), '[]') alloc,
      coalesce(json_agg(json_build_object('accountId', am.account_id::text, 'amount', am.amount::float)) filter (where am.id is not null), '[]') amounts
    from fin_rows r
    left join contragents c on c.id=r.contragent_id
    left join documents d on d.id=r.doc_id
    left join fin_expense_articles ea on ea.id=r.expense_article_id
    left join fin_row_amounts am on am.row_id=r.id
    where r.org_id=${orgId} and r.date=${date}
    group by r.id, c.name, d.number, d.type, ea.code, ea.name
    order by r.sort_order, r.created_at` as unknown as Promise<any[]>

export const datesForOrg = (orgId: string) =>
  sqlClient`select distinct date::text as date from fin_rows where org_id=${orgId} order by date desc` as unknown as Promise<Array<{ date: string }>>

// Журнал документов: все проведённые операции за период (для вкладки «Документы»).
export const journalRows = (orgId: string, from: string, to: string) =>
  sqlClient`select r.id::text, r.date::text, r.type, r.code, r.article, r.who, r.comment, r.status,
      r.contragent_id::text "contragentId", c.name "contragent",
      coalesce((select json_agg(json_build_object('accountId', al.account_id::text, 'amount', al.amount::float)) from fin_row_amounts al where al.row_id=r.id), '[]') amounts
    from fin_rows r left join contragents c on c.id=r.contragent_id
    where r.org_id=${orgId} and r.status='posted' and r.date between ${from} and ${to}
    order by r.date desc, r.created_at desc limit 500` as unknown as Promise<any[]>

export const deletePaymentsForRow = (rowId: string) => db.delete(payments).where(eq(payments.finRowId, rowId))

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

export const deleteAlloc = (rowId: string) => db.delete(finRowAlloc).where(eq(finRowAlloc.rowId, rowId))
export const insertAlloc = (vals: typeof finRowAlloc.$inferInsert[]) => vals.length ? db.insert(finRowAlloc).values(vals) : Promise.resolve()
export const allocForRow = (rowId: string) =>
  sqlClient`select a.doc_id::text "docId", a.amount::float amount, d.number from fin_row_alloc a join documents d on d.id=a.doc_id where a.row_id=${rowId}` as unknown as Promise<any[]>
export const setPosted = (ids: string[]) => ids.length ? db.update(finRows).set({ status: 'posted' }).where(inArray(finRows.id, ids)) : Promise.resolve()
export const setSort = (id: string, sort: number) => db.update(finRows).set({ sortOrder: sort }).where(eq(finRows.id, id))

export const clearFavorites = (orgId: string) => db.delete(finFavorites).where(eq(finFavorites.orgId, orgId))
export const insertFavorites = (vals: typeof finFavorites.$inferInsert[]) => vals.length ? db.insert(finFavorites).values(vals) : Promise.resolve()

export const archiveExpenseArticles = (orgId: string) => db.update(finExpenseArticles).set({ archived: true }).where(eq(finExpenseArticles.orgId, orgId))
export const insertExpenseArticles = (vals: typeof finExpenseArticles.$inferInsert[]) => vals.length ? db.insert(finExpenseArticles).values(vals) : Promise.resolve()

export const insertPayment = (val: typeof payments.$inferInsert) => db.insert(payments).values(val)

// Отчёт ДДС: обороты по статьям за период (перемещения/служебные исключены).
export const ddsRows = (orgId: string, from: string, to: string) =>
  sqlClient`
    with rt as (
      select r.id, r.code, r.article, coalesce(f.activity, 'operating') activity,
        (select coalesce(sum(a.amount),0) from fin_row_amounts a where a.row_id=r.id)::float total
      from fin_rows r
      left join fin_favorites f on f.org_id=r.org_id and f.code=r.code
      where r.org_id=${orgId} and r.status='posted' and r.date between ${from} and ${to}
        and r.type not in ('mv','service')
    )
    select activity, code, article,
      sum(case when total>0 then total else 0 end)::float inflow,
      sum(case when total<0 then -total else 0 end)::float outflow
    from rt group by activity, code, article
    having sum(case when total>0 then total else 0 end)<>0 or sum(case when total<0 then -total else 0 end)<>0
    order by activity, code` as unknown as Promise<Array<{ activity: string; code: string | null; article: string; inflow: number; outflow: number }>>

// Оборот по счёту за период (для конечного остатка).
export const periodNetByAccount = (orgId: string, from: string, to: string) =>
  sqlClient`select a.account_id::text id, coalesce(sum(a.amount),0)::float amt
    from fin_row_amounts a join fin_rows r on r.id=a.row_id
    where r.org_id=${orgId} and r.status='posted' and r.date between ${from} and ${to}
    group by a.account_id` as unknown as Promise<Array<{ id: string; amt: number }>>

// Поиск документов для привязки в строке (номер/контрагент).
export const docSearch = (orgId: string, q: string) =>
  sqlClient`select d.id::text, d.number, d.type, d.total::float total, d.date::text, c.name contragent
    from documents d left join contragents c on c.id=d.contragent_id
    where d.org_id=${orgId} and d.status<>'cancelled'
      and (${q} = '' or d.number ilike ${'%' + q + '%'} or c.name ilike ${'%' + q + '%'})
    order by d.created_at desc limit 30` as unknown as Promise<any[]>

