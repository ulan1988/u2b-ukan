// Запросы по документам (только Drizzle). Логика проводки — в service.
import { db, sqlClient } from '../lib/db'
import { documents, documentLines, stockMovements, docLinks } from '../db/schema'
import { and, desc, eq, or, sql } from 'drizzle-orm'

type NewDoc = typeof documents.$inferInsert
type NewLine = typeof documentLines.$inferInsert
type NewMove = typeof stockMovements.$inferInsert
type NewDocLink = typeof docLinks.$inferInsert

export async function countByType(orgId: string, type: string): Promise<number> {
  const r = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.type, type)))
  return r[0]?.c ?? 0
}

// Проводка атомарно: документ + строки + движения склада (+ связи закуп↔продажа) одним батчем.
export async function insertDocumentPosting(doc: NewDoc, lines: NewLine[], moves: NewMove[], links?: NewDocLink[]) {
  const q: any[] = [
    db.insert(documents).values(doc),
    db.insert(documentLines).values(lines),
    db.insert(stockMovements).values(moves),
  ]
  if (links && links.length) q.push(db.insert(docLinks).values(links))
  await db.batch(q as [any, ...any[]])
}

// Партии закупа по товару (FIFO: старые первыми) с остатком к списанию и ценой закупа.
export async function purchaseLots(orgId: string, productId: string) {
  return sqlClient`
    select d.id as purchase_doc_id,
      sum(dl.qty)::float    as line_qty,
      sum(dl.amount)::float as line_amount,
      coalesce(lk.qty,0)::float as linked_qty
    from documents d
    join document_lines dl on dl.document_id=d.id and dl.product_id=${productId} and dl.role='main'
    left join (select purchase_doc_id, sum(qty) qty from doc_links where product_id=${productId} group by purchase_doc_id) lk on lk.purchase_doc_id=d.id
    where d.org_id=${orgId} and d.type='purchase' and d.status<>'cancelled'
    group by d.id, lk.qty
    order by d.date asc, d.created_at asc` as unknown as Promise<Array<{ purchase_doc_id: string; line_qty: number; line_amount: number; linked_qty: number }>>
}

// Сторно документа: удаляем движения склада и связи, ставим статус cancelled.
// Атомарно (батч) — склад и финансы сразу перестают его учитывать.
export async function cancelDocument(docId: string) {
  await db.batch([
    db.delete(stockMovements).where(eq(stockMovements.documentId, docId)),
    db.delete(docLinks).where(or(eq(docLinks.saleDocId, docId), eq(docLinks.purchaseDocId, docId))),
    db.update(documents).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(documents.id, docId)),
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
