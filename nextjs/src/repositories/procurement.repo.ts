// Автозакуп: сводка потребности, черновик-накопитель, связи закуп→продажа.
import { db } from '../lib/db'
import { orders, orderPositions, procurementLinks, products } from '../db/schema'
import { and, eq, inArray, desc, isNull } from 'drizzle-orm'

// Новые продажи во Входящих/Приёмке (кандидаты на закуп) с позициями.
export async function saleDemand(orgId: string) {
  const cards = await db.select().from(orders).where(and(
    eq(orders.orgId, orgId), eq(orders.kind, 'sale'),
    inArray(orders.screen, ['incoming', 'reception']),
    eq(orders.isDraft, false), eq(orders.isCancelled, false),
    eq(orders.transit, false),   // сквозные (drop-ship) в автозакуп НЕ попадают — товар мимо склада
  ))
  if (!cards.length) return { cards: [], positions: [] as any[] }
  const positions = await db.select().from(orderPositions).where(inArray(orderPositions.cardId, cards.map(c => c.id)))
  return { cards, positions }
}

// Уже связанные пары (saleCardId + товар) — исключить из сводки.
export const procuredPairs = (orgId: string) =>
  db.select({ saleCardId: procurementLinks.saleCardId, product: procurementLinks.product })
    .from(procurementLinks)
    .innerJoin(orders, eq(procurementLinks.purchaseCardId, orders.id))
    // Отменённый закуп не считается «закуплено» — продажа возвращается в потребность автозакупа.
    .where(and(eq(orders.orgId, orgId), eq(orders.isCancelled, false)))

// Открытый черновик-накопитель закупа.
export const openDraft = (orgId: string) =>
  db.select().from(orders).where(and(
    eq(orders.orgId, orgId), eq(orders.kind, 'purchase'),
    eq(orders.isDraft, true), eq(orders.isCancelled, false),
  )).orderBy(desc(orders.createdAt)).limit(1)

export const countPurchases = async (orgId: string) => {
  const r = await db.select({ c: orders.id }).from(orders).where(and(eq(orders.orgId, orgId), eq(orders.kind, 'purchase')))
  return r.length
}

export const insertDraft = (v: typeof orders.$inferInsert) => db.insert(orders).values(v).returning()
export const insertPositions = (v: (typeof orderPositions.$inferInsert)[]) => db.insert(orderPositions).values(v).returning()
export const insertLinks = (v: (typeof procurementLinks.$inferInsert)[]) => db.insert(procurementLinks).values(v)

// Закупы (kind purchase) с позициями — для отчёта-цепочки.
export async function purchaseCards(orgId: string) {
  const cards = await db.select().from(orders).where(and(
    eq(orders.orgId, orgId), eq(orders.kind, 'purchase'), eq(orders.isCancelled, false),
  )).orderBy(desc(orders.createdAt)).limit(200)
  if (!cards.length) return { cards: [], positions: [] as any[] }
  const positions = await db.select().from(orderPositions).where(inArray(orderPositions.cardId, cards.map(c => c.id)))
  return { cards, positions }
}

export const linksByPurchases = (ids: string[]) =>
  ids.length ? db.select().from(procurementLinks).where(inArray(procurementLinks.purchaseCardId, ids)) : Promise.resolve([] as any[])

// Продажи, у которых связанный закуп ещё НЕ проведён (нет приходной = товар не пришёл).
// Такие продажи логист не должен видеть в «Продаже» — сначала закуп.
export async function salesWaitingProcure(saleIds: string[]): Promise<Set<string>> {
  if (!saleIds.length) return new Set()
  const rows = await db.select({ id: procurementLinks.saleCardId }).from(procurementLinks)
    .innerJoin(orders, eq(procurementLinks.purchaseCardId, orders.id))
    .where(and(inArray(procurementLinks.saleCardId, saleIds), isNull(orders.linkedDocId), eq(orders.isCancelled, false)))
  return new Set(rows.map(r => r.id))
}

export const ordersByIds = (ids: string[]) =>
  ids.length ? db.select({ id: orders.id, fromName: orders.fromName, comment: orders.comment }).from(orders).where(inArray(orders.id, ids)) : Promise.resolve([] as any[])

export const productsByNames = (names: string[]) =>
  names.length ? db.select({ id: products.id, name: products.name, group: products.group, cat: products.category, priceIn: products.priceIn }).from(products).where(inArray(products.name, names)) : Promise.resolve([] as any[])

export const productsByIds = (ids: string[]) =>
  ids.length ? db.select({ id: products.id, name: products.name, unit: products.unit, priceRetail: products.priceRetail, priceOpt: products.priceOpt, priceSpec: products.priceSpec }).from(products).where(inArray(products.id, ids)) : Promise.resolve([] as any[])
