import { db } from '../lib/db'
import { payments } from '../db/schema'
import { desc, eq } from 'drizzle-orm'

export async function insertPayment(p: typeof payments.$inferInsert) {
  await db.insert(payments).values(p)
}

export function listByOrg(orgId: string) {
  return db.select().from(payments).where(eq(payments.orgId, orgId)).orderBy(desc(payments.createdAt)).limit(100)
}
