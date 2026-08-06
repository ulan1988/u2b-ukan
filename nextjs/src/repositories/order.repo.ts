// Заявки-карточки Улкана (только запросы Drizzle).
import { db } from '../lib/db'
import { orders, orderPositions, orderHistory, products } from '../db/schema'
import { and, eq, desc, inArray, sql } from 'drizzle-orm'

// Метаданные товаров (группа/подгруппа) для автоподстановки по группе.
export const productMeta = (ids: string[]) =>
  ids.length ? db.select({ id: products.id, group: products.group, cat: products.category }).from(products).where(inArray(products.id, ids)) : Promise.resolve([] as any[])

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

export const listByOrg = (orgId: string) =>
  db.select().from(orders).where(eq(orders.orgId, orgId)).orderBy(desc(orders.createdAt))

export const ordersForClient = (orgId: string, userId: string) =>
  db.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.fromId, userId))).orderBy(desc(orders.createdAt))

export const positionsByCards = (cardIds: string[]) =>
  cardIds.length
    ? db.select().from(orderPositions).where(inArray(orderPositions.cardId, cardIds)).orderBy(orderPositions.id)
    : Promise.resolve([] as any[])

export const getOrder = (id: string) =>
  db.select().from(orders).where(eq(orders.id, id)).limit(1)

export const positionsByCard = (cardId: string) =>
  db.select().from(orderPositions).where(eq(orderPositions.cardId, cardId)).orderBy(orderPositions.id)

export const historyByCard = (cardId: string) =>
  db.select().from(orderHistory).where(eq(orderHistory.cardId, cardId)).orderBy(desc(orderHistory.createdAt))

// Журнал действий по всей организации (join c orders для скоупа по org).
export const historyByOrg = (orgId: string, limit = 200) =>
  db.select({
    id: orderHistory.id, cardId: orderHistory.cardId, action: orderHistory.action,
    detail: orderHistory.detail, userName: orderHistory.userName, createdAt: orderHistory.createdAt,
  }).from(orderHistory).innerJoin(orders, eq(orderHistory.cardId, orders.id))
    .where(eq(orders.orgId, orgId)).orderBy(desc(orderHistory.createdAt)).limit(limit)

// Позиции, назначенные логисту, на активных стадиях (для портала логиста).
export const positionsForLogist = (orgId: string, userId: string) =>
  db.select({ o: orders, p: orderPositions })
    .from(orderPositions).innerJoin(orders, eq(orderPositions.cardId, orders.id))
    .where(and(
      eq(orders.orgId, orgId), eq(orderPositions.respUserId, userId),
      inArray(orders.screen, ['outgoing', 'reception']), eq(orders.isCancelled, false),
    )).orderBy(desc(orders.createdAt))

export const updateOrder = (id: string, patch: Partial<typeof orders.$inferInsert>) =>
  db.update(orders).set({ ...patch, updatedAt: sql`now()` }).where(eq(orders.id, id)).returning()

export const updatePosition = (id: string, patch: Partial<typeof orderPositions.$inferInsert>) =>
  db.update(orderPositions).set({ ...patch, updatedAt: sql`now()` }).where(eq(orderPositions.id, id)).returning()

export const updatePositionsByCard = (cardId: string, patch: Partial<typeof orderPositions.$inferInsert>) =>
  db.update(orderPositions).set({ ...patch, updatedAt: sql`now()` }).where(eq(orderPositions.cardId, cardId)).returning()

export const insertHistory = (row: typeof orderHistory.$inferInsert) =>
  db.insert(orderHistory).values(row)

export const insertPosition = (v: typeof orderPositions.$inferInsert) =>
  db.insert(orderPositions).values(v).returning()

export const countPositions = async (cardId: string) => {
  const r = await db.select({ id: orderPositions.id }).from(orderPositions).where(eq(orderPositions.cardId, cardId))
  return r.length
}
