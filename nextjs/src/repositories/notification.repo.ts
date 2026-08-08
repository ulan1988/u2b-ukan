// Уведомления пользователя (только запросы Drizzle).
import { db } from '../lib/db'
import { notifications } from '../db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'

// Число непрочитанных у пользователя (для бейджа-числа на иконке).
export const unreadCount = async (userId: string) => {
  const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
  return r?.c ?? 0
}

export const byUser = (userId: string, limit = 50) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit)

export const markRead = (id: string, userId: string) =>
  db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId))).returning()

export const insertMany = (v: (typeof notifications.$inferInsert)[]) =>
  v.length ? db.insert(notifications).values(v) : Promise.resolve()
