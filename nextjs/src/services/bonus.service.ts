// БОНУСНАЯ ПРОДАЖА (магазин Кристалл): товар из папки «Долг товар» берём у соседа,
// продаём мимо склада. Себестоимости в чеке нет — есть БОНУС = (цена − цена соседа) × кол-во.
// Бонус делим 50/50 с головным (а не 60/40, как обычную маржу).
//   • деньги соседа (цена соседа × кол-во) ложатся в журнал «Долг товаров» — вернём ему
//     деньгами или товаром;
//   • доля головного — строкой bonus_rows.hq_share, закрывается инкассацией.
import { db, sqlClient } from '../lib/db'
import { bonusRows } from '../db/schema'
import { randomUUID } from 'crypto'
import { today } from '../lib/num'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0
const r2 = (n: number) => Math.round(n * 100) / 100
export const HQ_SHARE = 0.5

// Записать бонус по чеку: строки bonus_rows + долг товара соседу.
export async function registerBonus(orgId: string, cardId: string, date?: string, actor?: Session | null) {
  const poss = await sqlClient`
    select id, coalesce(name1c, oral) name, qty::float qty, price::float price,
      bonus_cost::float cost, bonus_agent_id "agentId", unit
    from order_positions where card_id = ${cardId} and bonus_cost > 0 and bonus_agent_id is not null
  ` as unknown as Array<any>
  if (!poss.length) return { ok: true as const, count: 0, bonus: 0, hqShare: 0 }

  const day = date || today()
  const { addGoodsDebt } = await import('./goodsDebt.service')
  let bonusTotal = 0, hqTotal = 0
  for (const p of poss) {
    const qty = num(p.qty), price = num(p.price), cost = num(p.cost)
    const bonus = r2((price - cost) * qty)
    const hq = r2(bonus * HQ_SHARE)
    bonusTotal = r2(bonusTotal + bonus); hqTotal = r2(hqTotal + hq)
    await db.insert(bonusRows).values({
      id: randomUUID(), orgId, date: day, cardId, posId: p.id, agentId: p.agentId,
      productName: p.name || '', qty: String(qty), price: String(price), cost: String(cost),
      bonus: String(bonus), hqShare: String(hq),
    } as any)
    // Долг соседу — товаром: взяли у него столько-то, вернём товаром или деньгами.
    try {
      await addGoodsDebt(orgId, {
        contragentId: p.agentId, productName: p.name || '', unit: p.unit || 'шт',
        direction: 'take', qty, note: `бонусная продажа ${cardId}`,
      }, actor as any)
    } catch (e) { console.error('bonus goods debt', cardId, e) }
  }
  return { ok: true as const, count: poss.length, bonus: bonusTotal, hqShare: hqTotal }
}

// Снять бонус по чеку (отмена продажи / возврат всего чека): строки удаляем,
// долг товара соседу остаётся — товар физически уже у него забран, разбираются вручную.
export async function dropBonus(cardId: string) {
  await sqlClient`delete from bonus_rows where card_id = ${cardId}`
  return { ok: true as const }
}

// Свод бонусов за день — для «Кассы дня»: сколько заработали, сколько доля головного,
// и сколько вернуть каждому соседу.
export async function bonusDay(orgId: string, date: string) {
  const rows = await sqlClient`
    select b.id, b.card_id "cardId", b.product_name "productName", b.qty::float qty,
      b.price::float price, b.cost::float cost, b.bonus::float bonus, b.hq_share::float "hqShare",
      c.name agent, d.number "docNumber"
    from bonus_rows b
    left join contragents c on c.id = b.agent_id
    left join orders o on o.id = b.card_id
    left join documents d on d.id = o.linked_doc_id
    where b.org_id = ${orgId} and b.date = ${date}
    order by b.created_at
  ` as unknown as Array<any>
  const totals = rows.reduce((s, r) => ({
    sold: r2(s.sold + num(r.price) * num(r.qty)),
    toAgent: r2(s.toAgent + num(r.cost) * num(r.qty)),
    bonus: r2(s.bonus + num(r.bonus)),
    hqShare: r2(s.hqShare + num(r.hqShare)),
  }), { sold: 0, toAgent: 0, bonus: 0, hqShare: 0 })
  return { rows, totals, ourShare: r2(totals.bonus - totals.hqShare) }
}
