// Уведомления пользователя (только запросы Drizzle).
import { db } from '../lib/db'
import { notifications } from '../db/schema'
import { and, eq, desc } from 'drizzle-orm'

export const byUser = (userId: string, limit = 50) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit)

export const markRead = (id: string, userId: string) =>
  db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId))).returning()

export const insertMany = (v: (typeof notifications.$inferInsert)[]) =>
  v.length ? db.insert(notifications).values(v) : Promise.resolve()
