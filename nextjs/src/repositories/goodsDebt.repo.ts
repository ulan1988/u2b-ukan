// «Долг товаров» (касса магазина) — только запросы Drizzle. Отдельный журнал, без склада.
import { db } from '../lib/db'
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
