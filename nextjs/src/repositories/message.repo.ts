// Чат по карточке (только запросы Drizzle).
import { db } from '../lib/db'
import { cardMessages } from '../db/schema'
import { eq, asc } from 'drizzle-orm'

export const byCard = (cardId: string) =>
  db.select().from(cardMessages).where(eq(cardMessages.cardId, cardId)).orderBy(asc(cardMessages.createdAt))

export const insert = (v: typeof cardMessages.$inferInsert) =>
  db.insert(cardMessages).values(v).returning()
