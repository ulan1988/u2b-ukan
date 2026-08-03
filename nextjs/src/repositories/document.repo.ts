// Запросы по документам (только Drizzle). Логика проводки — в service.
import { db } from '../lib/db'
import { documents, documentLines, stockMovements } from '../db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

type NewDoc = typeof documents.$inferInsert
type NewLine = typeof documentLines.$inferInsert
type NewMove = typeof stockMovements.$inferInsert

export async function countByType(orgId: string, type: string): Promise<number> {
  const r = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.type, type)))
  return r[0]?.c ?? 0
}

// Проводка атомарно: документ + строки + движения склада (один батч).
export async function insertDocumentPosting(doc: NewDoc, lines: NewLine[], moves: NewMove[]) {
  await db.batch([
    db.insert(documents).values(doc),
    db.insert(documentLines).values(lines),
    db.insert(stockMovements).values(moves),
  ])
}

export function listByType(orgId: string, type: string) {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.type, type)))
    .orderBy(desc(documents.createdAt))
    .limit(100)
}

// Остаток склада = Σ движений по (склад, товар). Отдаём по всем товарам склада.
export function stockByWarehouse(orgId: string, warehouseId: string) {
  return db
    .select({ productId: stockMovements.productId, qty: sql<string>`sum(${stockMovements.qty})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.warehouseId, warehouseId)))
    .groupBy(stockMovements.productId)
}
