// Финанс «Деньги»: дневной кассовый лист. Чтение — sqlClient, запись — drizzle.
import { db, sqlClient } from '../lib/db'
import { finRows, finRowAmounts, finRowAlloc, finFavorites, finExpenseArticles, payments, documents } from '../db/schema'
import { and, eq, inArray, isNull, sql as dsql } from 'drizzle-orm'

// Неоплаченные накладные контрагента (для погашения платежом).
// Оплата поставщику гасит приходные (наши закупы у него); от клиента — расходные.
export const contragentOpenInvoices = (orgId: string, contragentId: string, kind: 'purchase' | 'sale') =>
  sqlClient`select id::text, number, date::text, total::float total, paid_sum::float paid,
      (total - paid_sum)::float outstanding
    from documents
    where org_id=${orgId} and contragent_id=${contragentId} and type=${kind} and status<>'cancelled'
      and (total - paid_sum) > 0
      -- всё до даты начальных остатков уже сидит в opening_balance контрагента
      and date >= coalesce((select opening_as_of from organizations o where o.id = documents.org_id), '0001-01-01'::date)
    order by date, created_at` as unknown as Promise<any[]>

export const bumpPaidSum = (docId: string, delta: number) =>
  db.update(documents).set({ paidSum: dsql`${documents.paidSum} + ${String(delta)}`, updatedAt: new Date() }).where(eq(documents.id, docId))

export const accounts = (orgId: string) =>
  sqlClient`select id::text, name, kind from cash_accounts where org_id=${orgId} and archived=false order by sort_order, name` as unknown as Promise<Array<{ id: string; name: string; kind: string }>>

// Счета-КОЛОНКИ листа «Операции» (Касса дня): только помеченные cashday. Балансы/«Счета»
// показывают все активные счета, а оперативный лист — компактный фикс-набор.
export const cashdayAccounts = (orgId: string) =>
  sqlClient`select id::text, name, kind from cash_accounts where org_id=${orgId} and archived=false and cashday=true order by sort_order, name` as unknown as Promise<Array<{ id: string; name: string; kind: string }>>

// Прямые платежи для АВТО-строк листа «Операции»/«Документы»: ВСЕ платежи орг без fin_row_id —
// касса-продажи, инкассации, оплаты из кабинета, погашения долга, возвраты, оплаты поставщикам.
// Каждый платёж = кассовый ордер (приход/расход) с привязкой к накладной (как в 1С «Деньги и документы»).
export const autoFinPayments = (orgId: string) =>
  sqlClient`select p.id::text, p.date::text, p.direction, p.amount::float amount, p.cash_account_id::text "cashAccountId",
      p.contragent_id::text "contragentId", c.name "contragent", p.comment, p.accepted,
      p.document_id::text "docId", d.number "docNumber"
    from payments p
    left join contragents c on c.id=p.contragent_id
    left join documents d on d.id=p.document_id
    where p.org_id=${orgId} and p.fin_row_id is null
    order by p.date` as unknown as Promise<Array<{ id: string; date: string; direction: string; amount: number; cashAccountId: string | null; contragentId: string | null; contragent: string | null; comment: string | null; accepted: boolean; docId: string | null; docNumber: string | null }>>

// Вид орг (hq/producer_seller/seller) — фикс-строки «Операций» нужны только головному.
export const orgKind = (orgId: string) =>
  sqlClient`select kind from organizations where id=${orgId} limit 1` as unknown as Promise<Array<{ kind: string }>>

// Движения по счетам орг за период (режим «Финанс» Уканбана): платежи + проведённые строки «Деньги».
export const ledgerMovements = (orgId: string, from: string, to: string) =>
  sqlClient`
    select date::text, acc, amount::float amount, contragent, article, docn "docNumber", docid "docId", src from (
      select p.date, p.cash_account_id::text acc,
        (case when p.direction='in' then p.amount else -p.amount end) amount,
        c.name contragent, coalesce(nullif(p.comment,''),'Платёж') article, dd.number docn, dd.id::text docid, 'pay' src
      from payments p
      left join contragents c on c.id=p.contragent_id
      left join documents dd on dd.id=p.document_id
      where p.org_id=${orgId} and p.cash_account_id is not null and p.date between ${from} and ${to}
      union all
      select r.date, a.account_id::text acc, a.amount, c.name contragent, r.article, null docn, null::text docid, 'fin' src
      from fin_row_amounts a
      join fin_rows r on r.id=a.row_id
      left join contragents c on c.id=r.contragent_id
      where r.org_id=${orgId} and r.status='posted' and r.date between ${from} and ${to}
    ) t order by date, acc` as unknown as Promise<Array<{ date: string; acc: string; amount: number; contragent: string | null; article: string | null; docNumber: string | null; docId: string | null; src: string }>>

// Остаток по счетам НА начало периода = Σ движений (платежи + строки «Деньги») до даты.
export const ledgerOpening = (orgId: string, before: string) =>
  sqlClient`
    select acc, sum(amount)::float amt from (
      select cash_account_id::text acc, (case when direction='in' then amount else -amount end) amount
        from payments where org_id=${orgId} and cash_account_id is not null and date < ${before}
      union all
      select a.account_id::text acc, a.amount amount
        from fin_row_amounts a join fin_rows r on r.id=a.row_id
        where r.org_id=${orgId} and r.status='posted' and r.date < ${before}
    ) t group by acc` as unknown as Promise<Array<{ acc: string; amt: number }>>

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


// ── Оплата из кабинета клиента, ждущая подтверждения (accepted=false) ──────────
// Берём только «свободный» платёж (без строки «Денег»), чтобы не задеть обычные.
export async function pendingPayment(orgId: string, id: string) {
  const [r] = await db.select({ id: payments.id, amount: payments.amount, accepted: payments.accepted })
    .from(payments).where(and(eq(payments.id, id), eq(payments.orgId, orgId), isNull(payments.finRowId))).limit(1)
  return r ? { id: r.id, amount: Number(r.amount) || 0, accepted: !!r.accepted } : null
}
export const acceptPayment = (id: string) =>
  db.update(payments).set({ accepted: true }).where(eq(payments.id, id))
export const deletePendingPayment = (id: string) =>
  db.delete(payments).where(and(eq(payments.id, id), eq(payments.accepted, false)))

// ── Отмена проведения ────────────────────────────────────────────────────────
// Платежи, созданные строкой листа «Деньги» (fin_row_id) — их сторнируем при отмене.
export const paymentsOfFinRow = (rowId: string) =>
  sqlClient`select id::text, amount::float amount, document_id::text "docId" from payments where fin_row_id=${rowId}` as unknown as Promise<Array<{ id: string; amount: number; docId: string | null }>>

export const deletePaymentsOfFinRow = (rowId: string) =>
  sqlClient`delete from payments where fin_row_id=${rowId}`

export const setDraft = (ids: string[]) =>
  ids.length ? db.update(finRows).set({ status: 'draft' }).where(inArray(finRows.id, ids)) : Promise.resolve()

// Один платёж (для отмены авто-строки листа).
export const paymentById = (orgId: string, id: string) =>
  sqlClient`select p.id::text, p.org_id::text "orgId", p.direction, p.amount::float amount, p.date::text date,
      p.comment, p.document_id::text "docId", p.fin_row_id::text "finRowId", p.cash_account_id::text "accountId",
      c.name contragent
    from payments p left join contragents c on c.id=p.contragent_id
    where p.id=${id} and p.org_id=${orgId} limit 1` as unknown as Promise<Array<any>>

export const deletePaymentById = (id: string) => sqlClient`delete from payments where id=${id}`

// Парный приход головного по инкассации филиала (та же дата и сумма) — отменяем обе стороны.
export const remitPairAtHq = (branchOrgId: string, date: string, amount: number) =>
  sqlClient`select p.id::text from payments p
    join organizations o on o.id=p.org_id and o.kind='hq'
    where p.date=${date} and p.direction='in' and p.amount=${String(amount)}
      and p.comment like ${'Инкассация от «' + branchOrgId + '»%'}
    limit 1` as unknown as Promise<Array<{ id: string }>>

// Остаток по счетам на конец дня: НАЧАЛЬНЫЙ ОСТАТОК счёта + проведённые строки листа (≤ дата)
// + платежи (≤ дата). Движения ДО даты отсечения (`opening_as_of`) не считаем — они уже внутри
// начального остатка (иначе перенос из 1С задваивается, как было с долгами контрагентов).
export const balanceByAccount = (orgId: string, date: string) =>
  sqlClient`select acc id, coalesce(sum(amt),0)::float amt from (
      select ca.id::text acc, ca.opening_balance::float amt
        from cash_accounts ca
        where ca.org_id=${orgId} and (ca.opening_as_of is null or ca.opening_as_of <= ${date})
      union all
      select a.account_id::text acc, a.amount::float amt
        from fin_row_amounts a join fin_rows r on r.id=a.row_id
        join cash_accounts ca2 on ca2.id=a.account_id
        where r.org_id=${orgId} and r.status='posted' and r.date <= ${date}
          and r.date >= coalesce(ca2.opening_as_of, '0001-01-01'::date)
      union all
      select p.cash_account_id::text acc, (case when p.direction='in' then p.amount else -p.amount end)::float amt
        from payments p join cash_accounts ca3 on ca3.id=p.cash_account_id
        where p.org_id=${orgId} and p.date <= ${date} and p.cash_account_id is not null and p.fin_row_id is null
          and p.date >= coalesce(ca3.opening_as_of, '0001-01-01'::date)
    ) t where acc is not null group by acc` as unknown as Promise<Array<{ id: string; amt: number }>>
