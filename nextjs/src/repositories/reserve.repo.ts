// Резерв склада под заявку (движения kind='reserve'). Только запросы Drizzle.
import { db } from '../lib/db'
import { stockMovements, warehouses } from '../db/schema'
import { and, eq, sql } from 'drizzle-orm'

export const centralWarehouse = async (orgId: string) => {
  const rows = await db.select().from(warehouses).where(and(eq(warehouses.orgId, orgId), eq(warehouses.archived, false)))
  return rows.find(w => w.isCentral) || rows[0] || null
}

export const insertMoves = (v: (typeof stockMovements.$inferInsert)[]) =>
  v.length ? db.insert(stockMovements).values(v) : Promise.resolve()

export const deleteReservesByCard = (cardId: string) =>
  db.delete(stockMovements).where(and(eq(stockMovements.cardId, cardId), eq(stockMovements.kind, 'reserve')))

// Свободный остаток = сумма move-движений − активные резервы (по товару/складу).
export const reservedByProduct = (orgId: string, warehouseId: string) =>
  db.select({ productId: stockMovements.productId, reserved: sql<string>`sum(${stockMovements.qty})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.warehouseId, warehouseId), eq(stockMovements.kind, 'reserve')))
    .groupBy(stockMovements.productId)
