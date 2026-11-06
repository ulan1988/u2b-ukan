// Прибыль дня магазина: деньги дня (приходы по продажам, возвраты минусом) + себестоимость
// документа, к которому платёж привязан. Прибыль признаётся ПО ДЕНЬГАМ: пришла оплата —
// в этот день и прибыль; погасили долг позже — прибыль в день погашения.
import { sqlClient } from '../lib/db'
import { db } from '../lib/db'
import { profitRows } from '../db/schema'
import { and, eq } from 'drizzle-orm'

// Платежи дня с себестоимостью их документа.
//  kind='sale'   — приход от покупателя (прибыль +)
//  kind='return' — выплата по возвратной накладной (прибыль −)
export const dayPayments = (orgId: string, date: string) => sqlClient`
  with doc_cost as (
    select d.id,
      coalesce(sum(dl.qty * coalesce(nullif(op.cost_price,0), pr.price_in, 0)),0)::float cost,
      count(*) filter (where coalesce(nullif(op.cost_price,0), pr.price_in, 0) = 0)::int nocost
    from documents d
    join document_lines dl on dl.document_id = d.id
    left join order_positions op on op.id = dl.source_pos_id
    left join products pr on pr.id = dl.product_id
    where d.org_id = ${orgId} and d.status <> 'cancelled' and d.type in ('sale','return_in')
    group by d.id
  )
  select p.id "paymentId", p.amount::float amount, p.cash_account_id "accountId", a.name "accountName",
    d.id "docId", d.number "docNumber", d.type, d.source_order_id "cardId", d.total::float "docTotal",
    dc.cost::float "docCost", dc.nocost::int nocost, c.name contragent,
    case when d.type = 'return_in' then 'return' else 'sale' end kind
  from payments p
  join documents d on d.id = p.document_id
  join doc_cost dc on dc.id = d.id
  left join cash_accounts a on a.id = p.cash_account_id
  left join contragents c on c.id = p.contragent_id
  where p.org_id = ${orgId} and p.date = ${date}
    and ((p.direction = 'in' and d.type = 'sale') or (p.direction = 'out' and d.type = 'return_in'))
  order by p.created_at
` as unknown as Promise<Array<any>>

export const rowsForDay = (orgId: string, date: string) =>
  db.select().from(profitRows).where(and(eq(profitRows.orgId, orgId), eq(profitRows.date, date)))

export const deleteDay = (orgId: string, date: string) =>
  db.delete(profitRows).where(and(eq(profitRows.orgId, orgId), eq(profitRows.date, date)))

export const insertRows = (vals: (typeof profitRows.$inferInsert)[]) =>
  vals.length ? db.insert(profitRows).values(vals).returning() : Promise.resolve([] as any[])

// Проведённая прибыль по платежам (для листа «Деньги»): paymentId → сумма прибыли.
export const postedByPayment = (orgId: string, date: string) => sqlClient`
  select payment_id "paymentId", coalesce(sum(amount),0)::float amount
  from profit_rows where org_id = ${orgId} and date = ${date} and status = 'posted' and payment_id is not null
  group by payment_id
` as unknown as Promise<Array<any>>
