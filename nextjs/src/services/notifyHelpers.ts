// Хелперы адресных уведомлений (админам орг и т.п.).
import { db } from '../lib/db'
import { users } from '../db/schema'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { notify } from './notification.service'

export async function notifyAdmins(orgId: string, text: string, cardId?: string, exceptUserId?: string) {
  const admins = await db.select({ id: users.id }).from(users).where(and(
    eq(users.orgId, orgId), inArray(users.role, ['admin', 'super_admin', 'bookkeeper']),
    exceptUserId ? ne(users.id, exceptUserId) : undefined as any,
  ))
  await notify(admins.map(a => a.id), text, cardId)
}

export async function notifyUser(userId: string, text: string, cardId?: string) {
  await notify([userId], text, cardId)
}
