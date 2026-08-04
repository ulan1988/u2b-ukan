// Запросы стартового сидера (только Drizzle).
import { db } from '../lib/db'
import { organizations, contragents, warehouses, products, cashAccounts, users } from '../db/schema'
import { sql } from 'drizzle-orm'

export async function countOrganizations() {
  const r = await db.select({ c: sql<number>`count(*)::int` }).from(organizations)
  return r[0]?.c ?? 0
}

export const insertOrganization = (v: typeof organizations.$inferInsert) => db.insert(organizations).values(v).returning()
export const insertOrganizations = (v: (typeof organizations.$inferInsert)[]) => db.insert(organizations).values(v)
export const insertWarehouse = (v: typeof warehouses.$inferInsert) => db.insert(warehouses).values(v)
export const insertCashAccounts = (v: (typeof cashAccounts.$inferInsert)[]) => db.insert(cashAccounts).values(v)
export const insertContragents = (v: (typeof contragents.$inferInsert)[]) => db.insert(contragents).values(v)
export const insertProducts = (v: (typeof products.$inferInsert)[]) => db.insert(products).values(v)
export const insertUser = (v: typeof users.$inferInsert) => db.insert(users).values(v)
