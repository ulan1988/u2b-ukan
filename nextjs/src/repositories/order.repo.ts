// Заявки-карточки Улкана (только запросы Drizzle).
import { db } from '../lib/db'
import { orders, orderPositions, orderHistory } from '../db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'

export async function countByKind(orgId: string, kind: string) {
  const r = await db.select({ c: sql<number>`count(*)::int` }).from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.kind, kind)))
  return r[0]?.c ?? 0
}

// Атомарно: карточка + позиции + запись истории.
export function insertOrderPosting(
  order: typeof orders.$inferInsert,
  positions: (typeof orderPositions.$inferInsert)[],
  history: typeof orderHistory.$inferInsert,
) {
  const stmts: any[] = [db.insert(orders).values(order)]
  if (positions.length) stmts.push(db.insert(orderPositions).values(positions))
  stmts.push(db.insert(orderHistory).values(history))
  return db.batch(stmts as [any, ...any[]])
}

export const listByScreen = (orgId: string, screen: string) =>
  db.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.screen, screen)))
    .orderBy(desc(orders.createdAt))

export const getOrder = (id: string) =>
  db.select().from(orders).where(eq(orders.id, id)).limit(1)

export const positionsByCard = (cardId: string) =>
  db.select().from(orderPositions).where(eq(orderPositions.cardId, cardId)).orderBy(orderPositions.id)

export const historyByCard = (cardId: string) =>
  db.select().from(orderHistory).where(eq(orderHistory.cardId, cardId)).orderBy(desc(orderHistory.createdAt))

export const updateOrder = (id: string, patch: Partial<typeof orders.$inferInsert>) =>
  db.update(orders).set({ ...patch, updatedAt: sql`now()` }).where(eq(orders.id, id)).returning()

export const updatePosition = (id: string, patch: Partial<typeof orderPositions.$inferInsert>) =>
  db.update(orderPositions).set({ ...patch, updatedAt: sql`now()` }).where(eq(orderPositions.id, id)).returning()

export const insertHistory = (row: typeof orderHistory.$inferInsert) =>
  db.insert(orderHistory).values(row)
