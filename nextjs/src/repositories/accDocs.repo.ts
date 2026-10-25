// Бухгалтерия → печатные документы: только Drizzle (слой repository).
import { db } from '../lib/db'
import { accDocs, accOrgSettings } from '../db/schema'
import { and, desc, eq } from 'drizzle-orm'

export const listDocs = (orgId: string) =>
  db.select().from(accDocs).where(eq(accDocs.orgId, orgId)).orderBy(desc(accDocs.createdAt))

export const findDoc = async (id: string) => (await db.select().from(accDocs).where(eq(accDocs.id, id)).limit(1))[0]

export const numbersOf = (orgId: string, type: string) =>
  db.select({ number: accDocs.number }).from(accDocs).where(and(eq(accDocs.orgId, orgId), eq(accDocs.type, type)))

export const createDoc = async (row: typeof accDocs.$inferInsert) => (await db.insert(accDocs).values(row).returning())[0]

export const removeDoc = (id: string) => db.delete(accDocs).where(eq(accDocs.id, id))

export const getSettings = async (orgId: string) => (await db.select().from(accOrgSettings).where(eq(accOrgSettings.orgId, orgId)).limit(1))[0]

export async function upsertSettings(orgId: string, patch: Partial<typeof accOrgSettings.$inferInsert>) {
  const set = { ...patch, updatedAt: new Date() }
  await db.insert(accOrgSettings).values({ orgId, ...set }).onConflictDoUpdate({ target: accOrgSettings.orgId, set })
}
