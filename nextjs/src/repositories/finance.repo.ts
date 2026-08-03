// Финансовые агрегаты — «сырой» SQL через neon-клиент (параметризованно и быстро).
import { sqlClient } from '../lib/db'

// Итоги по орг: продажи, закупы, оплаты in/out, стоимость склада (по priceIn).
export async function totals(orgId: string) {
  const r = await sqlClient`
    select
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='sale' and status<>'cancelled')::float as sales,
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='purchase' and status<>'cancelled')::float as purchases,
      (select coalesce(sum(amount),0) from payments where org_id=${orgId} and direction='in')::float as pay_in,
      (select coalesce(sum(amount),0) from payments where org_id=${orgId} and direction='out')::float as pay_out,
      (select coalesce(sum(sm.qty * p.price_in),0) from stock_movements sm join products p on p.id=sm.product_id where sm.org_id=${orgId})::float as stock_value`
  return r[0] as { sales: number; purchases: number; pay_in: number; pay_out: number; stock_value: number }
}

// Баланс по каждому контрагенту: продажи/закупы и оплаты in/out.
export async function contragentBalances(orgId: string) {
  return sqlClient`
    select c.id, c.name, c.kind,
      coalesce(s.total,0)::float as sales,
      coalesce(p.total,0)::float as purchases,
      coalesce(pi.total,0)::float as pay_in,
      coalesce(po.total,0)::float as pay_out
    from contragents c
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='sale'     and status<>'cancelled' group by contragent_id) s  on s.contragent_id=c.id
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='purchase' and status<>'cancelled' group by contragent_id) p  on p.contragent_id=c.id
    left join (select contragent_id, sum(amount) total from payments where org_id=${orgId} and direction='in'  group by contragent_id) pi on pi.contragent_id=c.id
    left join (select contragent_id, sum(amount) total from payments where org_id=${orgId} and direction='out' group by contragent_id) po on po.contragent_id=c.id
    where c.org_id=${orgId} and c.archived=false
    order by c.name` as unknown as Promise<Array<{ id: string; name: string; kind: string; sales: number; purchases: number; pay_in: number; pay_out: number }>>
}
