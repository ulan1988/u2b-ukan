// СЕБЕСТОИМОСТЬ — СВОЯ У КАЖДОЙ ОРГАНИЗАЦИИ (правило владельца 26.11.2026: «у каждого филиала своя
// себестоимость: за сколько получил товар в приходной накладной»). Магазин Кристалл берёт товар у головного —
// его себестоимость = цена приходной от Адал Строй 2 (она же в 1С Кристалла), а не заводская цена головного.
// Порядок: себестоимость строки (order_positions.cost_price — у изделия доля листа) → цена последней
// ПРОВЕДЁННОЙ ПРИХОДНОЙ этой орг на дату продажи или раньше (приходов до даты нет — ближайший после) →
// общий закуп шаблона products.price_in (запасной вариант, если приходных у орг нет вовсе).
// Строки изделий (width_cm заполнен) в цену прихода не идут — там цена за см, а не за штуку.
// В агрегатных SQL (отчёт дня/месяца, прибыль, рентабельность) тот же порядок встроен прямо в запрос
// подзапросом `left join lateral (… document_lines … type='purchase' …) oc` — правило одно.
import { sqlClient } from '../lib/db'
import { today } from '../lib/num'

// Себестоимость единицы по товарам для орг на дату: { productId: цена }.
export async function orgCostMap(orgId: string | null | undefined, productIds: string[], date?: string): Promise<Record<string, number>> {
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  if (!ids.length) return {}
  const day = date || today()
  const rows = await sqlClient`
    select p.id::text id, coalesce(oc.price, p.price_in::float, 0)::float cost
    from products p
    left join lateral (
      select dl.price::float price from document_lines dl join documents d on d.id = dl.document_id
      where d.org_id = ${orgId || null} and d.type = 'purchase' and d.status = 'posted'
        and dl.product_id = p.id and dl.price > 0 and dl.width_cm is null
      order by (d.date <= ${day}::date) desc, d.date desc, d.created_at desc limit 1
    ) oc on true
    where p.id = any(${ids}::uuid[])
  ` as unknown as Array<{ id: string; cost: number }>
  const out: Record<string, number> = {}
  for (const r of rows) out[r.id] = Number(r.cost) || 0
  return out
}

// Последняя приходная цена КАЖДОГО товара орг (для каталогов: «👁 себестоимость» в кассе магазина).
export async function lastOrgCosts(orgId: string): Promise<Map<string, number>> {
  const rows = await sqlClient`
    select distinct on (dl.product_id) dl.product_id::text id, dl.price::float price
    from document_lines dl join documents d on d.id = dl.document_id
    where d.org_id = ${orgId} and d.type = 'purchase' and d.status = 'posted' and dl.price > 0 and dl.width_cm is null
    order by dl.product_id, d.date desc, d.created_at desc
  ` as unknown as Array<{ id: string; price: number }>
  return new Map(rows.map(r => [r.id, Number(r.price) || 0]))
}
