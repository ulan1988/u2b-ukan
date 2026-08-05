// Правила автоподстановки поставщик/логист по группе (только запросы Drizzle).
import { db } from '../lib/db'
import { categoryRules } from '../db/schema'
import { and, eq } from 'drizzle-orm'

export const listRules = (orgId: string) =>
  db.select().from(categoryRules).where(eq(categoryRules.orgId, orgId))

export const findRule = (orgId: string, category: string) =>
  db.select().from(categoryRules).where(and(eq(categoryRules.orgId, orgId), eq(categoryRules.category, category))).limit(1)

export const upsertRule = async (v: typeof categoryRules.$inferInsert) => {
  const [ex] = await findRule(v.orgId, v.category)
  if (ex) return db.update(categoryRules).set({ ...v, updatedAt: new Date() }).where(eq(categoryRules.id, ex.id)).returning()
  return db.insert(categoryRules).values(v).returning()
}
