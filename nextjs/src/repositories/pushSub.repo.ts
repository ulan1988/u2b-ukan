// Web Push подписки (только запросы Drizzle).
import { db } from '../lib/db'
import { pushSubscriptions } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'

// Сохранить подписку (по endpoint — уникальна; перепривязываем к текущему пользователю).
export const upsert = (v: { userId: string; endpoint: string; p256dh: string; auth: string }) =>
  db.insert(pushSubscriptions).values(v)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: v.userId, p256dh: v.p256dh, auth: v.auth } })

export const byUsers = (userIds: string[]) =>
  userIds.length ? db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)) : Promise.resolve([] as any[])

export const removeByEndpoint = (endpoint: string) =>
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
