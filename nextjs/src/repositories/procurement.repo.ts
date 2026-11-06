// Автозакуп: сводка потребности, черновик-накопитель, связи закуп→продажа.
import { db } from '../lib/db'
import { orders, orderPositions, procurementLinks, products, contragents } from '../db/schema'
import { and, eq, ne, inArray, desc, isNull, sql as sqlOp } from 'drizzle-orm'

// Новые продажи во Входящих/Приёмке (кандидаты на закуп) с позициями.
export async function saleDemand(orgId: string) {
  const cards = await db.select().from(orders).where(and(
    eq(orders.orgId, orgId), eq(orders.kind, 'sale'),
    inArray(orders.screen, ['incoming', 'reception']),
    eq(orders.isDraft, false), eq(orders.isCancelled, false),
    eq(orders.transit, false),   // сквозные (drop-ship) в автозакуп НЕ попадают — товар мимо склада
    // «Выполнено филиалом» — карточка-ознакомление: филиал сам изготовил и отгрузил, накладные
    // уже проведены. Закупать по ней нечего, в потребность она попадать не должна.
    ne(orders.source, 'branch_done'),
  ))
  if (!cards.length) return { cards: [], positions: [] as any[] }
  // Сквозные ПОЗИЦИИ (мимо склада) в автозакуп не идут — карточка может быть смешанной (часть строк сквозные).
  const positions = await db.select().from(orderPositions).where(and(
    inArray(orderPositions.cardId, cards.map(c => c.id)), eq(orderPositions.transit, false),
  ))
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

// Действующие (НЕ отменённые) связи закупа по этим продажам — чтобы при отмене одного закупа
// не вернуть в потребность продажу, которая закуплена другим.
export const activeLinksForSales = (saleIds: string[]) =>
  saleIds.length
    ? db.select({ saleCardId: procurementLinks.saleCardId }).from(procurementLinks)
        .innerJoin(orders, eq(procurementLinks.purchaseCardId, orders.id))
        .where(and(inArray(procurementLinks.saleCardId, saleIds), eq(orders.isCancelled, false)))
    : Promise.resolve([] as { saleCardId: string }[])

// Продажи, у которых связанный закуп ещё НЕ проведён (нет приходной = товар не пришёл).
// Такие продажи логист не должен видеть в «Продаже» — сначала закуп.
export async function salesWaitingProcure(saleIds: string[]): Promise<Set<string>> {
  if (!saleIds.length) return new Set()
  const rows = await db.select({ id: procurementLinks.saleCardId }).from(procurementLinks)
    .innerJoin(orders, eq(procurementLinks.purchaseCardId, orders.id))
    .where(and(inArray(procurementLinks.saleCardId, saleIds), isNull(orders.linkedDocId), eq(orders.isCancelled, false)))
  return new Set(rows.map(r => r.id))
}

// Ждущие закупа ПОЗИЦИИ продаж: ключ «cardId::товар» (имя в нижнем регистре).
// Строка ждёт, если по ней есть связь с закупом, который не отменён и ещё не проведён
// (нет приходной). Строки закупа ПЛЕЧА ФИЛИАЛА (leg=1) не считаем: их привозит филиал
// своей отгрузкой, а не закуп — иначе готовое изделие зря висело бы серым у логиста.
export async function positionsWaitingProcure(saleIds: string[]): Promise<Set<string>> {
  if (!saleIds.length) return new Set()
  const { sqlClient } = await import('../lib/db')
  const rows = await sqlClient`
    select pl.sale_card_id sid, lower(trim(pl.product)) prod
    from procurement_links pl
    join orders o on o.id = pl.purchase_card_id and o.is_cancelled = false and o.linked_doc_id is null
    left join order_positions pp on pp.card_id = pl.purchase_card_id
      and lower(trim(coalesce(pp.name1c, pp.oral, '')) ) = lower(trim(pl.product))
    where pl.sale_card_id = any(${saleIds as any})
      -- Товар УЖЕ куплен: по этой паре (продажа + товар) есть закуп с проведённой приходной.
      -- Без этого зависший черновик-дубль держал продажу в ожидании навсегда, хотя
      -- настоящий закуп проведён и товар на складе.
      and not exists (
        select 1 from procurement_links dl
        join orders d2 on d2.id = dl.purchase_card_id
        where dl.sale_card_id = pl.sale_card_id
          and lower(trim(dl.product)) = lower(trim(pl.product))
          and d2.is_cancelled = false and d2.linked_doc_id is not null
      )
    group by 1, 2
    having coalesce(bool_or(coalesce(pp.leg, 2) <> 1), true)
  ` as unknown as Array<any>
  return new Set(rows.map((r: any) => `${r.sid}::${r.prod}`))
}

export const ordersByIds = (ids: string[]) =>
  ids.length ? db.select({ id: orders.id, fromName: orders.fromName, comment: orders.comment }).from(orders).where(inArray(orders.id, ids)) : Promise.resolve([] as any[])

export const productsByNames = (names: string[]) =>
  names.length ? db.select({ id: products.id, name: products.name, group: products.group, cat: products.category, priceIn: products.priceIn }).from(products).where(inArray(products.name, names)) : Promise.resolve([] as any[])

export const productsByIds = (ids: string[]) =>
  ids.length ? db.select({ id: products.id, name: products.name, unit: products.unit, priceRetail: products.priceRetail, priceOpt: products.priceOpt, priceSpec: products.priceSpec }).from(products).where(inArray(products.id, ids)) : Promise.resolve([] as any[])

// Снять связь автозакупа по продаже и ИМЕНИ товара: связь матчится по имени, поэтому после
// смены товара в позиции старая запись «висит» и продажа считается закупленной по прежнему.
export const deleteLinksBySaleProduct = (saleCardId: string, product: string) =>
  db.delete(procurementLinks).where(and(
    eq(procurementLinks.saleCardId, saleCardId),
    sqlOp`lower(trim(${procurementLinks.product})) = ${String(product || '').trim().toLowerCase()}`,
  ))

// Под чьи заявки оформлен закуп: закуп-карточка → имена ЗАКАЗЧИКОВ связанных продаж.
// Нужно логисту: у закупа нет своего контрагента, и в шапке стояло имя админа,
// который нажал «оформить закуп», а везти товар надо заказчику заявки.
export const clientsByPurchase = async (purchaseIds: string[]) => {
  const map = new Map<string, string[]>()
  if (!purchaseIds.length) return map
  const rows = await db.select({
    pid: procurementLinks.purchaseCardId,
    client: contragents.name,
    from: orders.fromName,
  }).from(procurementLinks)
    .innerJoin(orders, eq(orders.id, procurementLinks.saleCardId))
    .leftJoin(contragents, eq(contragents.id, orders.contactId))
    .where(inArray(procurementLinks.purchaseCardId, purchaseIds))
  for (const r of rows) {
    const name = (r.client || r.from || '').trim()
    if (!name) continue
    const list = map.get(r.pid) || []
    if (!list.includes(name)) list.push(name)
    map.set(r.pid, list)
  }
  return map
}
