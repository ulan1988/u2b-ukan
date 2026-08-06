// Чат по карточке (только запросы Drizzle).
import { db } from '../lib/db'
import { cardMessages, orders } from '../db/schema'
import { eq, asc, desc } from 'drizzle-orm'

export const byCard = (cardId: string) =>
  db.select().from(cardMessages).where(eq(cardMessages.cardId, cardId)).orderBy(asc(cardMessages.createdAt))

export const insert = (v: typeof cardMessages.$inferInsert) =>
  db.insert(cardMessages).values(v).returning()

// Сообщения всех карточек организации (для сводки тредов глобального чата),
// свежие первыми; с полями заказа для маршрута from→to.
export const messagesForOrg = (orgId: string) =>
  db.select({
    cardId: cardMessages.cardId, userName: cardMessages.userName, role: cardMessages.role,
    text: cardMessages.text, createdAt: cardMessages.createdAt,
    fromName: orders.fromName, kind: orders.kind, contactId: orders.contactId,
  }).from(cardMessages).innerJoin(orders, eq(cardMessages.cardId, orders.id))
    .where(eq(orders.orgId, orgId)).orderBy(desc(cardMessages.createdAt))
