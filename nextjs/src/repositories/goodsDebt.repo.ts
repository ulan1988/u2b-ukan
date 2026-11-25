// «Долг товаров» (касса магазина) — только запросы Drizzle. Отдельный журнал, без склада.
import { db, sqlClient } from '../lib/db'
import { goodsDebts, contragents } from '../db/schema'
import { and, eq, desc } from 'drizzle-orm'

// Все записи журнала по орг (взяли/вернули) — свежие сверху.
export const listByOrg = (orgId: string) =>
  db.select().from(goodsDebts).where(eq(goodsDebts.orgId, orgId)).orderBy(desc(goodsDebts.createdAt))

export const insertEntry = (v: typeof goodsDebts.$inferInsert) =>
  db.insert(goodsDebts).values(v).returning()

export const getEntry = async (id: string, orgId: string) => {
  const [r] = await db.select().from(goodsDebts)
    .where(and(eq(goodsDebts.id, id), eq(goodsDebts.orgId, orgId))).limit(1)
  return r || null
}

export const deleteEntry = (id: string, orgId: string) =>
  db.delete(goodsDebts).where(and(eq(goodsDebts.id, id), eq(goodsDebts.orgId, orgId)))

// Контрагент принадлежит этой орг? (долг товаров — только на своих, головной не участвует).
export const contragentInOrg = async (contragentId: string, orgId: string) => {
  const [r] = await db.select({ id: contragents.id, name: contragents.name })
    .from(contragents).where(and(eq(contragents.id, contragentId), eq(contragents.orgId, orgId))).limit(1)
  return r || null
}

// Движения долга товаров ЗА ДЕНЬ (местный день, Алматы) — для «Кассы дня». created_at хранится в UTC.
export const movesOfDay = (orgId: string, date: string) => sqlClient`
  select g.id, to_char(g.created_at at time zone 'UTC' at time zone 'Asia/Almaty', 'HH24:MI') t,
    extract(epoch from g.created_at)::float sec, g.contragent_id::text "contragentId", g.contragent_name "contragentName",
    g.direction, g.product_name "productName", g.qty::float qty, g.unit, g.created_by "createdBy"
  from goods_debts g
  where g.org_id = ${orgId} and (g.created_at at time zone 'UTC' at time zone 'Asia/Almaty')::date = ${date}::date
  order by g.created_at, g.product_name
` as unknown as Promise<Array<any>>

// Деньги по долгу товаров за тот же день: платежи с комментарием «Долг товаров (оплата|приход): …».
export const moneyOfDay = (orgId: string, date: string) => sqlClient`
  select extract(epoch from p.created_at)::float sec, p.contragent_id::text "contragentId", p.direction, p.amount::float amount, a.name account
  from payments p left join cash_accounts a on a.id = p.cash_account_id
  where p.org_id = ${orgId} and p.comment like 'Долг товаров%'
    and (p.created_at at time zone 'UTC' at time zone 'Asia/Almaty')::date = ${date}::date
` as unknown as Promise<Array<any>>
