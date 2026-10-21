// Хелперы адресных уведомлений.
// Правило получателей (окт-2026): уведомление по событию орг получают
//  • админы ЭТОЙ орг (их касается их филиал: мастер Нипы, админ филиала),
//  • ВСЕГДА админы головного (hq = Адал Строй 2),
//  • ВСЕГДА все логисты.
// Продавцы (роль branch) — НЕ получают (они не admin). Админ и логист — в курсе всего.
import { db } from '../lib/db'
import { users, organizations } from '../db/schema'
import { and, eq, inArray, or } from 'drizzle-orm'
import { notify } from './notification.service'

const ADMIN_ROLES = ['admin', 'super_admin', 'bookkeeper']

export async function notifyAdmins(orgId: string, text: string, cardId?: string, exceptUserId?: string) {
  const [hq] = await db.select({ id: organizations.id }).from(organizations)
    .where(and(eq(organizations.kind, 'hq'), eq(organizations.archived, false))).limit(1)
  const conds: any[] = [
    and(eq(users.orgId, orgId), inArray(users.role, ADMIN_ROLES)),   // админы орг события
    eq(users.role, 'logist'),                                        // все логисты — всегда
  ]
  if (hq) conds.push(and(eq(users.orgId, hq.id), inArray(users.role, ADMIN_ROLES)))  // головной — всегда
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.active, true), or(...conds)))
  let ids = Array.from(new Set(rows.map(r => r.id)))
  if (exceptUserId) ids = ids.filter(id => id !== exceptUserId)
  await notify(ids, text, cardId)
}

export async function notifyUser(userId: string, text: string, cardId?: string) {
  await notify([userId], text, cardId)
}
