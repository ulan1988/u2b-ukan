// Запросы по документам (только Drizzle). Логика проводки — в service.
import { db, sqlClient } from '../lib/db'
import { documents, documentLines, stockMovements, docLinks, products, contragents, warehouses } from '../db/schema'
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'

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

// Список накладных с именем контрагента (для экрана Приход/Расход, как в 1С).
export function listInvoices(orgId: string, type: string) {
  return db
    .select({
      id: documents.id, number: documents.number, date: documents.date, total: documents.total,
      status: documents.status, operation: documents.operation, contragent: contragents.name,
    })
    .from(documents).leftJoin(contragents, eq(documents.contragentId, contragents.id))
    .where(and(eq(documents.orgId, orgId), eq(documents.type, type)))
    .orderBy(desc(documents.createdAt)).limit(100)
}

export function listByTypes(orgId: string, types: string[]) {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), inArray(documents.type, types)))
    .orderBy(desc(documents.createdAt))
    .limit(100)
}

// Один документ + его строки (с именем товара) + имена контрагента/склада — для формы накладной.
export const getDoc = (id: string) => db.select().from(documents).where(eq(documents.id, id)).limit(1)

export const linesWithProduct = (docId: string) =>
  db.select({
    id: documentLines.id, productId: documentLines.productId, name: products.name,
    qty: documentLines.qty, unit: documentLines.unit, price: documentLines.price,
    amount: documentLines.amount, comment: documentLines.comment,
  }).from(documentLines).innerJoin(products, eq(documentLines.productId, products.id))
    .where(eq(documentLines.documentId, docId)).orderBy(asc(documentLines.id))

export const contragentById = (id: string) =>
  db.select({ id: contragents.id, name: contragents.name }).from(contragents).where(eq(contragents.id, id)).limit(1)
export const warehouseById = (id: string) =>
  db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(eq(warehouses.id, id)).limit(1)

export const updateDoc = (id: string, patch: Partial<NewDoc>) =>
  db.update(documents).set({ ...patch, updatedAt: new Date() }).where(eq(documents.id, id)).returning()
export const updateLine = (id: string, patch: Partial<NewLine>) =>
  db.update(documentLines).set(patch).where(eq(documentLines.id, id)).returning()

// Остаток склада = Σ движений по (склад, товар). Отдаём по всем товарам склада.
export function stockByWarehouse(orgId: string, warehouseId: string) {
  return db
    .select({ productId: stockMovements.productId, qty: sql<string>`sum(${stockMovements.qty})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.warehouseId, warehouseId)))
    .groupBy(stockMovements.productId)
}
