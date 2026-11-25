import { db } from '../lib/db'
import { payments } from '../db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

export async function insertPayment(p: typeof payments.$inferInsert) {
  await db.insert(payments).values(p)
}

export function listByOrg(orgId: string) {
  return db.select().from(payments).where(eq(payments.orgId, orgId)).orderBy(desc(payments.createdAt)).limit(100)
}

// Сколько пришло денег по документу (приходы) — остаток долга чека = сумма накладной − это.
export async function sumInByDocument(documentId: string) {
  const [r] = await db.select({ s: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments)
    .where(and(eq(payments.documentId, documentId), eq(payments.direction, 'in')))
  return Number(r?.s) || 0
}
