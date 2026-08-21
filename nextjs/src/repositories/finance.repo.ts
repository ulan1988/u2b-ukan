// Финансовые агрегаты — «сырой» SQL через neon-клиент (параметризованно и быстро).
import { sqlClient } from '../lib/db'

// Итоги по орг: продажи, закупы, оплаты in/out, стоимость склада (по priceIn).
export async function totals(orgId: string) {
  const r = await sqlClient`
    select
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='sale'       and status<>'cancelled')::float as sales,
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='purchase'   and status<>'cancelled')::float as purchases,
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='return_in'  and status<>'cancelled')::float as ret_in,
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='return_out' and status<>'cancelled')::float as ret_out,
      (select coalesce(sum(amount),0) from payments where org_id=${orgId} and direction='in')::float as pay_in,
      (select coalesce(sum(amount),0) from payments where org_id=${orgId} and direction='out')::float as pay_out,
      (select coalesce(sum(sm.qty * p.price_in),0) from stock_movements sm join products p on p.id=sm.product_id where sm.org_id=${orgId})::float as stock_value`
  return r[0] as { sales: number; purchases: number; ret_in: number; ret_out: number; pay_in: number; pay_out: number; stock_value: number }
}

// Рентабельность по продажам (как в 1С): выручка − себестоимость.
// Себестоимость = связанные партии закупа (doc_link × цена закупа) + остаток по priceIn.
export async function profitReport(orgId: string) {
  return sqlClient`
    with pline as (
      select document_id, product_id, sum(qty) qty, sum(amount) amount
      from document_lines where role='main' group by document_id, product_id
    ),
    linked as (
      select dl.sale_doc_id, dl.product_id,
        sum(dl.qty) as lqty,
        sum(dl.qty * (pl.amount / nullif(pl.qty,0))) as lcost
      from doc_links dl
      join pline pl on pl.document_id=dl.purchase_doc_id and pl.product_id=dl.product_id
      group by dl.sale_doc_id, dl.product_id
    ),
    saleline as (
      select sl.document_id, sl.product_id, sum(sl.qty) as sqty
      from document_lines sl
      join documents d on d.id=sl.document_id and d.type='sale'
      where sl.role='main' group by sl.document_id, sl.product_id
    ),
    cost as (
      select s.document_id as sale_id,
        coalesce(l.lcost,0) + greatest(s.sqty - coalesce(l.lqty,0),0) * p.price_in as line_cost
      from saleline s
      join products p on p.id=s.product_id
      left join linked l on l.sale_doc_id=s.document_id and l.product_id=s.product_id
    )
    select d.id, d.number, d.date::text as date, c.name as client,
      d.total::float as revenue,
      coalesce(sum(cost.line_cost),0)::float as cost
    from documents d
    left join contragents c on c.id=d.contragent_id
    left join cost on cost.sale_id=d.id
    where d.org_id=${orgId} and d.type='sale' and d.status<>'cancelled'
      and coalesce(d.operation,'') <> 'opening1c'   -- исторический импорт 1С (акт сверки) не в рентабельность
    group by d.id, d.number, d.date, c.name, d.total
    order by d.date desc, d.created_at desc` as unknown as Promise<Array<{ id: string; number: string; date: string; client: string | null; revenue: number; cost: number }>>
}

// Рентабельность ПО ТОВАРУ за период: выручка − себестоимость (FIFO закупа + непокрытая ×price_in).
export async function profitByProduct(orgId: string, from?: string, to?: string) {
  const f = from || null, t = to || null
  return sqlClient`
    with pline as (
      select document_id, product_id, sum(qty) qty, sum(amount) amount
      from document_lines where role='main' group by document_id, product_id
    ),
    saleline as (
      select sl.product_id, sl.document_id, sum(sl.qty) sqty, sum(sl.amount) samount
      from document_lines sl
      join documents d on d.id=sl.document_id and d.type='sale' and d.status<>'cancelled' and coalesce(d.operation,'')<>'opening1c'
      where sl.role='main' and d.org_id=${orgId}
        and (${f}::date is null or d.date >= ${f}::date)
        and (${t}::date is null or d.date <= ${t}::date)
      group by sl.product_id, sl.document_id
    ),
    linked as (
      select dl.sale_doc_id, dl.product_id, sum(dl.qty) lqty, sum(dl.qty*(pl.amount/nullif(pl.qty,0))) lcost
      from doc_links dl join pline pl on pl.document_id=dl.purchase_doc_id and pl.product_id=dl.product_id
      group by dl.sale_doc_id, dl.product_id
    )
    select s.product_id::text id, pr.name,
      sum(s.sqty)::float qty, sum(s.samount)::float revenue,
      sum(coalesce(l.lcost,0) + greatest(s.sqty-coalesce(l.lqty,0),0)*pr.price_in)::float cost
    from saleline s
    join products pr on pr.id=s.product_id
    left join linked l on l.sale_doc_id=s.document_id and l.product_id=s.product_id
    group by s.product_id, pr.name
    order by revenue desc` as unknown as Promise<Array<{ id: string; name: string; qty: number; revenue: number; cost: number }>>
}

// Нач. остаток контрагента (для выписки).
export async function contragentOpening(orgId: string, contragentId: string) {
  const r = await sqlClient`select coalesce(opening_balance,0)::float op from contragents where id=${contragentId} and org_id=${orgId}` as unknown as Array<{ op: number }>
  return r[0]?.op ?? 0
}

// Все документы (накладные/возвраты) одного контрагента — для выписки в кабинете.
export async function contragentDocs(orgId: string, contragentId: string) {
  return sqlClient`
    select id, number, type, date::text as date, total::float as total, status
    from documents
    where org_id=${orgId} and contragent_id=${contragentId}
      and type in ('sale','purchase','return_in','return_out') and status<>'cancelled'
    order by date desc, created_at desc` as unknown as Promise<Array<{ id: string; number: string; type: string; date: string; total: number; status: string }>>
}

// Оплаты одного контрагента.
export async function contragentPayments(orgId: string, contragentId: string) {
  return sqlClient`
    select id, direction, amount::float as amount, date::text as date, comment
    from payments where org_id=${orgId} and contragent_id=${contragentId}
    order by date desc, created_at desc` as unknown as Promise<Array<{ id: string; direction: string; amount: number; date: string; comment: string | null }>>
}

// Баланс по каждому контрагенту: продажи/закупы и оплаты in/out.
export async function contragentBalances(orgId: string) {
  return sqlClient`
    select c.id, c.name, c.kind,
      coalesce(c.opening_balance,0)::float as opening,
      coalesce(s.total,0)::float  as sales,
      coalesce(p.total,0)::float  as purchases,
      coalesce(ri.total,0)::float as ret_in,
      coalesce(ro.total,0)::float as ret_out,
      coalesce(pi.total,0)::float as pay_in,
      coalesce(po.total,0)::float as pay_out
    from contragents c
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='sale'       and status<>'cancelled' group by contragent_id) s  on s.contragent_id=c.id
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='purchase'   and status<>'cancelled' group by contragent_id) p  on p.contragent_id=c.id
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='return_in'  and status<>'cancelled' group by contragent_id) ri on ri.contragent_id=c.id
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='return_out' and status<>'cancelled' group by contragent_id) ro on ro.contragent_id=c.id
    left join (select contragent_id, sum(amount) total from payments where org_id=${orgId} and direction='in'  group by contragent_id) pi on pi.contragent_id=c.id
    left join (select contragent_id, sum(amount) total from payments where org_id=${orgId} and direction='out' group by contragent_id) po on po.contragent_id=c.id
    where c.org_id=${orgId} and c.archived=false
    order by c.name` as unknown as Promise<Array<{ id: string; name: string; kind: string; opening: number; sales: number; purchases: number; ret_in: number; ret_out: number; pay_in: number; pay_out: number }>>
}
