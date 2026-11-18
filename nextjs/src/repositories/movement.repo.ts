// «Документ движений»: четыре полосы одной страницы — заказы клиентов, заказы поставщикам,
// приходные, расходные. Только чтение: ничего не создаёт и не двигает, собирает то, что уже
// есть (карточки + накладные). Правило владельца 18.11.2026: открытое видно всегда, закрытое —
// за выбранный день.
import { db } from '../lib/db'
import { orders, orderPositions, documents, contragents, procurementLinks } from '../db/schema'
import { and, eq, ne, isNull, desc, inArray, sql } from 'drizzle-orm'

// Сумма карточки = Σ(кол-во × цена × см, если изделие) — та же формула, что в карточке.
const cardSum = sql<number>`(
  select coalesce(sum(op.qty * op.price * (case when coalesce(op.width_cm,0) > 0 then op.width_cm else 1 end)),0)::float
  from ${orderPositions} op where op.card_id = ${orders.id})`

const orderCols = {
  id: orders.id, kind: orders.kind, screen: orders.screen, status: orders.status,
  source: orders.source, fromName: orders.fromName, contactId: orders.contactId,
  parentCardId: orders.parentCardId, linkedDocId: orders.linkedDocId, rootCardId: orders.rootCardId,
  prodPhase: orders.prodPhase, createdAt: orders.createdAt, toWarehouseId: orders.toWarehouseId,
  contragent: contragents.name, sum: cardSum,
  positions: sql<number>`(select count(*) from ${orderPositions} op2 where op2.card_id = ${orders.id})::int`,
}

// Открытые карточки вида kind: не отменены, не в архиве, накладная ещё не проведена.
export const openOrders = (orgId: string, kind: string) =>
  db.select(orderCols).from(orders).leftJoin(contragents, eq(contragents.id, orders.contactId))
    .where(and(
      eq(orders.orgId, orgId), eq(orders.kind, kind), eq(orders.isCancelled, false),
      ne(orders.screen, 'archive'), isNull(orders.linkedDocId),
    ))
    .orderBy(desc(orders.createdAt))

// Закрытые карточки вида kind за день: день берём по НАКЛАДНОЙ, которой карточка закрыта.
export const closedOrdersOnDay = (orgId: string, kind: string, day: string) =>
  db.select(orderCols).from(orders)
    .innerJoin(documents, eq(documents.id, orders.linkedDocId))
    .leftJoin(contragents, eq(contragents.id, orders.contactId))
    .where(and(eq(orders.orgId, orgId), eq(orders.kind, kind), eq(documents.date, day)))
    .orderBy(desc(orders.createdAt))

// Накладные дня (приходные / расходные) — они всегда «закрытые», поэтому только по дате.
export const docsOnDay = (orgId: string, types: string[], day: string) =>
  db.select({
    id: documents.id, number: documents.number, type: documents.type, date: documents.date,
    total: documents.total, status: documents.status, sourceOrderId: documents.sourceOrderId,
    rootCardId: documents.rootCardId,
    warehouseId: documents.warehouseId, contragent: contragents.name,
  }).from(documents).leftJoin(contragents, eq(contragents.id, documents.contragentId))
    .where(and(eq(documents.orgId, orgId), inArray(documents.type, types), eq(documents.date, day)))
    .orderBy(documents.number)

// Материнская заявка закупа: автозакуп связывает карточку-закуп с заявками-продажами.
export const salesOfPurchases = (purchaseIds: string[]) =>
  purchaseIds.length
    ? db.selectDistinct({ purchaseCardId: procurementLinks.purchaseCardId, saleCardId: procurementLinks.saleCardId })
      .from(procurementLinks).where(inArray(procurementLinks.purchaseCardId, purchaseIds))
    : Promise.resolve([] as { purchaseCardId: string; saleCardId: string }[])
