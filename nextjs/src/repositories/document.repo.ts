// Запросы по документам (только Drizzle). Логика проводки — в service.
import { db, sqlClient } from '../lib/db'
import { documents, documentLines, stockMovements, docLinks, products, contragents, warehouses, orders, organizations, documentHistory } from '../db/schema'
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm'

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

// Счётчик документов типа за конкретный день (для порядкового номера приходной).
export async function countByTypeAndDate(orgId: string, type: string, ymd: string): Promise<number> {
  const r = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.type, type), eq(documents.date, ymd)))
  return r[0]?.c ?? 0
}

// Проводка атомарно: документ + строки + движения склада (+ связи закуп↔продажа) одним батчем.
export async function insertDocumentPosting(doc: NewDoc, lines: NewLine[], moves: NewMove[], links?: NewDocLink[]) {
  const q: any[] = [
    db.insert(documents).values(doc),
    db.insert(documentLines).values(lines),
  ]
  if (moves.length) q.push(db.insert(stockMovements).values(moves))   // сквозная: движений нет — не вставляем пустой массив
  if (links && links.length) q.push(db.insert(docLinks).values(links))
  await db.batch(q as [any, ...any[]])
}

// Заказчик(и) приходной = клиенты продаж, под которые закуплено (doc_links → продажи → контрагент).
export async function linkedSaleCustomers(docId: string): Promise<string> {
  // Зеркальная приходная (основание — карточка-продажа): заказчик = получатель продажи.
  const mir = await sqlClient`
    select c.name from documents d
    join orders o on o.id = d.source_order_id and o.kind = 'sale'
    join contragents c on c.id = o.contact_id
    where d.id = ${docId}` as unknown as Array<{ name: string | null }>
  if (mir[0]?.name) return mir[0].name
  const r = await sqlClient`
    select string_agg(distinct c.name, ', ') as names
    from doc_links dl join documents sd on sd.id = dl.sale_doc_id
    join contragents c on c.id = sd.contragent_id
    where dl.purchase_doc_id = ${docId}` as unknown as Array<{ names: string | null }>
  if (r[0]?.names) return r[0].names
  // Продажа ещё не проведена → doc_links нет. Заказчик известен из автозакупа:
  // карточка-основание прихода (ЗП) связана с карточками-продажами (procurement_links).
  const p = await sqlClient`
    select string_agg(distinct c.name, ', ') as names
    from documents d
    join procurement_links pl on pl.purchase_card_id = d.source_order_id
    join orders so on so.id = pl.sale_card_id
    join contragents c on c.id = so.contact_id
    where d.id = ${docId}` as unknown as Array<{ names: string | null }>
  return p[0]?.names || ''
}

// Себестоимость продажи (как в рентабельности): связанные приходные + непокрытое × price_in.
export async function docCost(docId: string): Promise<number> {
  const r = await sqlClient`
    select coalesce(sum(coalesce(lk.lcost,0) + greatest(sl.sqty - coalesce(lk.lqty,0),0) * p.price_in),0)::float as cost
    from (select product_id, sum(qty) sqty from document_lines where document_id=${docId} and role='main' group by product_id) sl
    join products p on p.id = sl.product_id
    left join (
      select dl.product_id, sum(dl.qty) lqty, sum(dl.qty * (pl.amount/nullif(pl.qty,0))) lcost
      from doc_links dl
      join (select document_id, product_id, sum(qty) qty, sum(amount) amount from document_lines where role='main' group by document_id, product_id) pl
        on pl.document_id=dl.purchase_doc_id and pl.product_id=dl.product_id
      where dl.sale_doc_id=${docId} group by dl.product_id
    ) lk on lk.product_id = sl.product_id` as unknown as Array<{ cost: number }>
  return Number(r[0]?.cost || 0)
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
export function listInvoices(orgId: string, type: string | string[]) {
  const types = Array.isArray(type) ? type : [type]
  return db
    .select({
      id: documents.id, number: documents.number, type: documents.type, date: documents.date, total: documents.total,
      status: documents.status, operation: documents.operation, reviewed: documents.reviewed,
      contragentAccepted: documents.contragentAccepted, contragentId: documents.contragentId, contragent: contragents.name,
      sourceOrderId: documents.sourceOrderId,   // карточка-основание → из неё строится дерево ЗКП → ПРД
      // Строки без цены (сумма 0): по такому товару себестоимость и прибыль посчитать нельзя —
      // в списке накладная помечается знаком ⚠, чтобы головной вписал цену.
      noPrice: sql<number>`(select count(*) from ${documentLines} dl where dl.document_id = ${documents.id} and dl.role = 'main' and coalesce(dl.amount,0) = 0)::int`,
      // Названия товаров документа — для поиска по номенклатуре.
      items: sql<string>`(select string_agg(p.name, ' | ') from ${documentLines} dl join ${products} p on p.id = dl.product_id where dl.document_id = ${documents.id})`,
      // Себестоимость ПРОДАЖИ = стоимость из СВЯЗАННЫХ приходных (doc_links, реально оплачено)
      // + непокрытое кол-во × приходная цена (price_in). Как в отчёте рентабельности.
      cost: sql<number>`(
        select coalesce(sum(coalesce(lk.lcost,0) + greatest(sl.sqty - coalesce(lk.lqty,0),0) * p.price_in),0)::float
        from (select product_id, sum(qty) sqty from document_lines where document_id = ${documents.id} and role='main' group by product_id) sl
        join products p on p.id = sl.product_id
        left join (
          select dl.product_id, sum(dl.qty) lqty, sum(dl.qty * (pl.amount / nullif(pl.qty,0))) lcost
          from doc_links dl
          join (select document_id, product_id, sum(qty) qty, sum(amount) amount from document_lines where role='main' group by document_id, product_id) pl
            on pl.document_id = dl.purchase_doc_id and pl.product_id = dl.product_id
          where dl.sale_doc_id = ${documents.id}
          group by dl.product_id
        ) lk on lk.product_id = sl.product_id
      )`,
      // Заказчик: для ПРОДАЖИ — конечный клиент из карточки-основания; для ПРИХОДА (автозакуп/зеркало)
      // — клиент(ы) продаж, под которые закуплено (через doc_links). «Для кого / на кого долг».
      // Порядок: ЗЕРКАЛЬНАЯ приходная (основание — карточка-ПРОДАЖА, головной продал филиалу)
      // → заказчик = получатель этой продажи, иначе в колонке всплывал тот, КОМУ филиал потом
      // перепродал товар (через doc_links), и накладная выглядела чужой.
      // Дальше — doc_links (под какие продажи закуплено) и связи автозакупа (procurement_links),
      // которые нужны, пока продажа ещё не проведена.
      // Поставщик РАСХОДНОЙ: у кого куплен проданный товар. Сначала связанные приходные
      // (doc_links), иначе поставщики строк закупа, собранного под эту продажу (автозакуп).
      // На расходной «Заказчик» = сам покупатель, поэтому вместо него показываем поставщика.
      // Закупа не было (товар со своего склада) — показываем склад отгрузки («Центр-Склад»).
      // ПОСТАВЩИК ДЛЯ ПОКУПАТЕЛЯ (правило владельца 16.11.2026). У ФИЛИАЛА смотрим, В ДОЛГ ЛИ
      // К ГОЛОВНОМУ ушла продажа — это видно по контрагенту накладной:
      //  • накладная выписана на МОСТ головного, а заказчик в карточке другой → товар покупателю
      //    поставляет Адал Строй 2 (заказчик должен ему), филиал этой же накладной гасит свой долг;
      //  • накладная на мост и заказчик тот же (продажа самому головному) → поставщик сам филиал;
      //  • накладная прямо на клиента (продал сам, за деньги) → поставщик тоже сам филиал.
      // У головного логика прежняя: у кого куплен проданный товар.
      supplier: sql<string>`(case when ${documents.type} = 'sale' then coalesce(
        (select case when oo.kind <> 'hq' then
            case when exists (select 1 from ${contragents} cb join organizations ob on ob.id = cb.org_ref_id and ob.kind = 'hq' where cb.id = ${documents.contragentId})
                   and (coalesce((select o9.contact_id from ${orders} o9 where o9.id = ${documents.sourceOrderId}), ${documents.contragentId}) <> ${documents.contragentId}
                     -- ручная накладная «в долг головному»: заказчика видно по цепочке у ГО
                     or exists (select 1 from ${documents} m2 join ${documents} s2 on s2.origin_doc_id = m2.id and s2.type = 'sale' and s2.status <> 'cancelled'
                                 where m2.parent_doc_id = ${documents.id} and m2.status <> 'cancelled'))
                 then (select oh.name from organizations oh where oh.kind = 'hq' order by oh.created_at limit 1)
                 else oo.name
            end end
          from organizations oo where oo.id = ${documents.orgId}),
        (select sc0.name from ${contragents} sc0 where sc0.id = ${documents.supplierId}),
        (select string_agg(distinct pc.name, ', ') from doc_links dl2 join documents pd on pd.id = dl2.purchase_doc_id join contragents pc on pc.id = pd.contragent_id where dl2.sale_doc_id = ${documents.id}),
        (select string_agg(distinct sc.name, ', ') from procurement_links pl2
           join order_positions pp2 on pp2.card_id = pl2.purchase_card_id and lower(trim(coalesce(pp2.name1c, pp2.oral, ''))) = lower(trim(pl2.product))
           join contragents sc on sc.id = pp2.supplier_id
          where pl2.sale_card_id = ${documents.sourceOrderId}),
        (select w2.name from ${warehouses} w2 where w2.id = ${documents.warehouseId})
      ) end)`,
      customer: sql<string>`(case when ${documents.type} = 'sale'
        then coalesce(
          (select c2.name from ${orders} o2 join ${contragents} c2 on c2.id = o2.contact_id where o2.id = ${documents.sourceOrderId}),
          -- Ручная расходная «в долг головному»: заказчик виден у ГО — зеркало → отгрузка получателю.
          (select c6.name from ${documents} m join ${documents} sh on sh.origin_doc_id = m.id and sh.type = 'sale' and sh.status <> 'cancelled'
             join ${contragents} c6 on c6.id = sh.contragent_id
           where m.parent_doc_id = ${documents.id} and m.status <> 'cancelled' limit 1)
        )
        else coalesce(
          (select c5.name from ${orders} o5 join ${contragents} c5 on c5.id = o5.contact_id where o5.id = ${documents.sourceOrderId} and o5.kind = 'sale'),
          (select string_agg(distinct c3.name, ', ') from doc_links dl join documents sd on sd.id = dl.sale_doc_id join contragents c3 on c3.id = sd.contragent_id where dl.purchase_doc_id = ${documents.id}),
          (select string_agg(distinct c4.name, ', ') from procurement_links pl join ${orders} o4 on o4.id = pl.sale_card_id join ${contragents} c4 on c4.id = o4.contact_id where pl.purchase_card_id = ${documents.sourceOrderId})
        )
      end)`,
    })
    .from(documents).leftJoin(contragents, eq(documents.contragentId, contragents.id))
    .where(and(eq(documents.orgId, orgId), inArray(documents.type, types), ne(documents.status, 'cancelled')))
    .orderBy(desc(documents.createdAt)).limit(200)
}

// Накладные конкретного контрагента (для его личного кабинета) — по contragent_id.
export function listInvoicesForContragent(orgId: string, contragentId: string, types: string[]) {
  return db
    .select({
      id: documents.id, number: documents.number, type: documents.type, date: documents.date, total: documents.total,
      status: documents.status, operation: documents.operation, reviewed: documents.reviewed,
      contragentAccepted: documents.contragentAccepted, contragent: contragents.name,
      items: sql<string>`(select string_agg(p.name, ' | ') from ${documentLines} dl join ${products} p on p.id = dl.product_id where dl.document_id = ${documents.id})`,
    })
    .from(documents).leftJoin(contragents, eq(documents.contragentId, contragents.id))
    .where(and(eq(documents.orgId, orgId), eq(documents.contragentId, contragentId), inArray(documents.type, types), ne(documents.status, 'cancelled')))
    .orderBy(desc(documents.createdAt)).limit(200)
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
    id: documentLines.id, productId: documentLines.productId,
    // Имя строки как в накладной (с цветом/размером), иначе имя товара из номенклатуры.
    name: sql<string>`coalesce(nullif(${documentLines.name}, ''), ${products.name})`,
    qty: documentLines.qty, unit: documentLines.unit, price: documentLines.price, priceIn: products.priceIn,
    amount: documentLines.amount, comment: documentLines.comment, sourcePosId: documentLines.sourcePosId,
    role: documentLines.role, lengthCm: documentLines.lengthCm, widthCm: documentLines.widthCm, rate: documentLines.rate,
    block: documentLines.block, sortOrder: documentLines.sortOrder,
  }).from(documentLines).innerJoin(products, eq(documentLines.productId, products.id))
    .where(eq(documentLines.documentId, docId)).orderBy(asc(documentLines.sortOrder), asc(documentLines.id))

export const contragentById = (id: string) =>
  // priceType нужен отгрузке получателю из приходной: цена = спец/опт/розница этого контрагента.
  // warehouseRefId — контрагент это НАШ склад: получателю не продаём, товар остаётся у нас.
  db.select({ id: contragents.id, name: contragents.name, orgRefId: contragents.orgRefId, priceType: contragents.priceType, warehouseRefId: contragents.warehouseRefId })
    .from(contragents).where(eq(contragents.id, id)).limit(1)
// Контрагент-мост: в книге orgId запись, указывающая (orgRefId) на refOrgId. Нужен для
// зеркальной накладной между орг (напр. в книге филиала контрагент «U2B головной»).
export const contragentByOrgRef = (orgId: string, refOrgId: string) =>
  db.select({ id: contragents.id, name: contragents.name }).from(contragents)
    .where(and(eq(contragents.orgId, orgId), eq(contragents.orgRefId, refOrgId), eq(contragents.archived, false))).limit(1)
export const warehouseById = (id: string) =>
  db.select({ id: warehouses.id, name: warehouses.name, orgId: warehouses.orgId, isCentral: warehouses.isCentral }).from(warehouses).where(eq(warehouses.id, id)).limit(1)

export const updateDoc = (id: string, patch: Partial<NewDoc>) =>
  db.update(documents).set({ ...patch, updatedAt: new Date() }).where(eq(documents.id, id)).returning()
export const updateLine = (id: string, patch: Partial<NewLine>) =>
  db.update(documentLines).set(patch).where(eq(documentLines.id, id)).returning()

// Остаток склада = Σ движений по (склад, товар). Отдаём по всем товарам склада.
// Все движения одного товара по всем накладным (со знаком по типу документа) — для «Движение товара».
// + приход/возврат от клиента, − расход/возврат поставщику. Отменённые исключены.
export async function productMovements(orgId: string, productId: string) {
  return sqlClient`
    select d.id as "docId", d.date, d.number, d.type, dl.role, coalesce(c.name,'') as contragent, coalesce(d.comment,'') as note,
      dl.qty::float as qty, dl.unit, dl.price::float as price,
      case when d.type in ('purchase','return_in') or (d.type = 'production' and dl.role = 'output') then dl.qty::float else -dl.qty::float end as signed
    from document_lines dl
    join documents d on d.id = dl.document_id
    left join contragents c on c.id = d.contragent_id
    where d.org_id = ${orgId} and dl.product_id = ${productId} and d.status <> 'cancelled'
    order by d.date asc, d.number asc` as unknown as Promise<Array<{ docId: string; date: string; number: string; type: string; role: string; note: string; contragent: string; qty: number; unit: string; price: number; signed: number }>>
}

export function stockByWarehouse(orgId: string, warehouseId: string) {
  return db
    .select({ productId: stockMovements.productId, qty: sql<string>`sum(${stockMovements.qty})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.warehouseId, warehouseId)))
    .groupBy(stockMovements.productId)
}

// Поставщик расходной, когда он не задан явно: связанные приходные (doc_links) → поставщики
// строк закупа, собранного под эту продажу → склад отгрузки (Центр-Склад как транзит).
export async function saleSupplierFallback(docId: string): Promise<string> {
  const r = await sqlClient`
    select coalesce(
      -- Филиал: поставщик для покупателя — головной (у головного ветка пропускается).
      (select case when oo.kind <> 'hq' then
          case when exists (select 1 from contragents cb join organizations ob on ob.id = cb.org_ref_id and ob.kind = 'hq' where cb.id = d.contragent_id)
                 and coalesce((select o9.contact_id from orders o9 where o9.id = d.source_order_id), d.contragent_id) <> d.contragent_id
               then (select oh.name from organizations oh where oh.kind = 'hq' order by oh.created_at limit 1)
               else oo.name
          end end
        from organizations oo where oo.id = d.org_id),
      (select string_agg(distinct pc.name, ', ') from doc_links dl join documents pd on pd.id = dl.purchase_doc_id
         join contragents pc on pc.id = pd.contragent_id where dl.sale_doc_id = d.id),
      (select string_agg(distinct sc.name, ', ') from procurement_links pl
         join order_positions pp on pp.card_id = pl.purchase_card_id
           and lower(trim(coalesce(pp.name1c, pp.oral, ''))) = lower(trim(pl.product))
         join contragents sc on sc.id = pp.supplier_id
        where pl.sale_card_id = d.source_order_id),
      (select w.name from warehouses w where w.id = d.warehouse_id)
    ) as name
    from documents d where d.id = ${docId}` as unknown as Array<{ name: string | null }>
  return r[0]?.name || ''
}

// ЗАКАЗЧИК ИЗ ЦЕПОЧКИ «ДОЛГ К ГОЛОВНОМУ»: расходная филиала выписана на мост, а кому товар
// ушёл на самом деле — видно у головного: зеркало (parent_doc_id) → его отгрузка получателю
// (origin_doc_id). Без этого в накладной филиала заказчик «терялся».
export async function chainRecipient(docId: string): Promise<string> {
  const r = await sqlClient`
    select c.name from documents m
    join documents s on s.origin_doc_id = m.id and s.type = 'sale' and s.status <> 'cancelled'
    join contragents c on c.id = s.contragent_id
    where m.parent_doc_id = ${docId} and m.status <> 'cancelled' limit 1
  ` as unknown as Array<{ name: string }>
  return r[0]?.name || ''
}

// Проведённые документы карточки-основания (защита от удаления карточки с накладными).
export const postedBySourceOrder = (cardId: string) =>
  db.select({ id: documents.id, number: documents.number }).from(documents)
    .where(and(eq(documents.sourceOrderId, cardId), ne(documents.status, 'cancelled')))

// ── Дерево накладных: наша расходная (мать) → зеркальные приходные филиалов (дочери) ──
// Накладные, РОЖДЁННЫЕ из этой: зеркала филиалов (parent_doc_id) и отгрузка получателю
// (origin_doc_id). По обеим связям идёт домино даты — день у всей цепочки один.
export const docsBornFrom = (docId: string) =>
  db.select().from(documents).where(and(
    or(eq(documents.parentDocId, docId), eq(documents.originDocId, docId)),
    ne(documents.status, 'cancelled'),
  ))

export const childDocs = (docId: string) =>
  db.select().from(documents).where(and(eq(documents.parentDocId, docId), ne(documents.status, 'cancelled')))

export const insertLines = (vals: NewLine[]) => (vals.length ? db.insert(documentLines).values(vals) : Promise.resolve())
export const deleteLine = (lineId: string) => db.delete(documentLines).where(eq(documentLines.id, lineId))

// Переписать движения склада документа (кол-во в строках изменилось центральной правкой).
export async function replaceMovements(docId: string, moves: NewMove[]) {
  await db.delete(stockMovements).where(eq(stockMovements.documentId, docId))
  if (moves.length) await db.insert(stockMovements).values(moves)
}

// Дата движений документа = дате самого документа. Нужна при переносе накладной задним
// числом: склад должен двигаться тем же днём, иначе остатки на дату разъедутся.
export const setMovementsDate = (docId: string, date: string) =>
  db.update(stockMovements).set({ date }).where(eq(stockMovements.documentId, docId))

// Остаток товара на складе (для предупреждения «уйдёт в минус» при правке дочерней).
export async function stockByProducts(orgId: string, warehouseId: string, productIds: string[]) {
  const out: Record<string, number> = {}
  if (!productIds.length) return out
  const rows = await db.select({ productId: stockMovements.productId, qty: sql<string>`sum(${stockMovements.qty})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.warehouseId, warehouseId), inArray(stockMovements.productId, productIds)))
    .groupBy(stockMovements.productId)
  for (const r of rows) out[r.productId] = Number(r.qty) || 0
  return out
}

// Дочерние накладные с названием орг-владельца (показываем, кому применится правка).
export const childDocsWithOrg = (docId: string) =>
  db.select({ id: documents.id, number: documents.number, orgId: documents.orgId, org: organizations.name, total: documents.total, reviewed: documents.reviewed })
    .from(documents).leftJoin(organizations, eq(documents.orgId, organizations.id))
    .where(and(eq(documents.parentDocId, docId), ne(documents.status, 'cancelled')))

// ── Журнал правок накладной ────────────────────────────────────────────────────
export const insertDocHistory = (v: typeof documentHistory.$inferInsert) => db.insert(documentHistory).values(v)
export const listDocHistory = (docId: string) =>
  db.select().from(documentHistory).where(eq(documentHistory.documentId, docId)).orderBy(desc(documentHistory.createdAt)).limit(50)

// Документ карточки в конкретной орг (нужен, чтобы связать третье звено цепочки с матерью).
export const docBySourceOrg = async (cardId: string, orgId: string, type: string) => {
  const [r] = await db.select({ id: documents.id, number: documents.number }).from(documents)
    .where(and(eq(documents.sourceOrderId, cardId), eq(documents.orgId, orgId), eq(documents.type, type), ne(documents.status, 'cancelled')))
    .orderBy(desc(documents.createdAt)).limit(1)
  return r || null
}

// ── УДАЛИТЬ ДОКУМЕНТ БЕССЛЕДНО (ошибочный) ───────────────────────────────────
// Сторно (cancelDocument) оставляет документ в списке со статусом «отменён». Иногда нужно
// именно стереть: убираем движения склада, FIFO-связи, оплаты по документу, привязки оплат
// листа «Деньги», строки, историю — и отвязываем карточку-заявку (она снова «к учёту»).
// Зеркала (parent_doc_id) и отгрузку получателю (origin_doc_id) стираем тем же проходом.
export async function purgeDocument(docId: string): Promise<string[]> {
  const kids = await sqlClient`select id::text from documents
    where parent_doc_id = ${docId} or origin_doc_id = ${docId}` as unknown as Array<{ id: string }>
  const gone: string[] = []
  for (const k of kids) gone.push(...await purgeDocument(k.id))
  const [row] = await sqlClient`select number from documents where id = ${docId}` as unknown as Array<{ number: string }>
  await sqlClient`delete from stock_movements where document_id = ${docId}`
  await sqlClient`delete from doc_links where sale_doc_id = ${docId} or purchase_doc_id = ${docId}`
  await sqlClient`delete from fin_row_alloc where doc_id = ${docId}`
  await sqlClient`delete from payments where document_id = ${docId}`
  await sqlClient`delete from document_lines where document_id = ${docId}`
  await sqlClient`delete from document_history where document_id = ${docId}`
  await sqlClient`update orders set linked_doc_id = null where linked_doc_id = ${docId}`
  await sqlClient`update documents set parent_doc_id = null where parent_doc_id = ${docId}`
  await sqlClient`update documents set origin_doc_id = null where origin_doc_id = ${docId}`
  await sqlClient`delete from documents where id = ${docId}`
  if (row?.number) gone.push(row.number)
  return gone
}

// ── ОБЪЕДИНЕНИЕ ПРИХОДНЫХ (правило 21.11.2026) ────────────────────────────────
// Поставщик привёз всё ОДНОЙ накладной, а у нас приходов несколько (их завели по разным
// карточкам). Кандидаты — проведённые приходные ТОГО ЖЕ поставщика в этой орг.
export const mergeCandidates = (orgId: string, docId: string, contragentId: string) =>
  db.select({ id: documents.id, number: documents.number, date: documents.date, total: documents.total, inNumber: documents.inNumber, reviewed: documents.reviewed })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.type, 'purchase'), eq(documents.contragentId, contragentId),
      ne(documents.id, docId), ne(documents.status, 'cancelled')))
    .orderBy(desc(documents.date)).limit(60)

// Перелить одну приходную в другую. Переезжают СТРОКИ (в свой блок = номер исходной),
// движения склада (днём приёмника), FIFO-связки, оплаты, привязки листа «Деньги»,
// дети-накладные (зеркала и отгрузка получателю) и карточка-заявка. Источник остаётся
// в базе отменённым с пометкой — иначе теряется след и повисает его карточка-основание.
// ВСЁ ПЕРЕЕХАВШЕЕ ЗАПИСЫВАЕТСЯ В ЖУРНАЛ ('mergeLog') — по нему работает «Разъединить».
export async function mergeDocInto(targetId: string, srcId: string, targetNumber: string, targetDate: string, block: string, sortShift: number) {
  const q = async (text: any) => (await text) as unknown as Array<any>
  const [src] = await q(sqlClient`select number, status, total::float t, comment, in_number from documents where id = ${srcId}`)
  const lines = await q(sqlClient`select id::text, coalesce(block,'') b, sort_order so from document_lines where document_id = ${srcId}`)
  const moves = await q(sqlClient`select id::text from stock_movements where document_id = ${srcId}`)
  const linkP = await q(sqlClient`select id::text from doc_links where purchase_doc_id = ${srcId}`)
  const linkS = await q(sqlClient`select id::text from doc_links where sale_doc_id = ${srcId}`)
  const pays = await q(sqlClient`select id::text from payments where document_id = ${srcId}`)
  const alloc = await q(sqlClient`select id::text from fin_row_alloc where doc_id = ${srcId}`)
  const kidsP = await q(sqlClient`select id::text from documents where parent_doc_id = ${srcId}`)
  const kidsO = await q(sqlClient`select id::text from documents where origin_doc_id = ${srcId}`)
  const cards = await q(sqlClient`select id from orders where linked_doc_id = ${srcId}`)
  const log = {
    src: srcId, number: src?.number || '', status: src?.status || 'posted', total: src?.t || 0,
    comment: src?.comment || null, inNumber: src?.in_number || null, date: null as any,
    lines: lines.map(l => ({ id: l.id, b: l.b, so: l.so })),
    moves: moves.map(m => m.id), linkP: linkP.map(x => x.id), linkS: linkS.map(x => x.id),
    pays: pays.map(x => x.id), alloc: alloc.map(x => x.id),
    kidsP: kidsP.map(x => x.id), kidsO: kidsO.map(x => x.id), cards: cards.map((x: any) => x.id),
  }
  const [d] = await q(sqlClient`select date::text dt from documents where id = ${srcId}`)
  log.date = d?.dt || null

  await sqlClient`update document_lines set document_id = ${targetId},
      block = case when coalesce(block, '') = '' then ${block} else block end,
      sort_order = sort_order + ${sortShift}
    where document_id = ${srcId}`
  await sqlClient`update stock_movements set document_id = ${targetId}, date = ${targetDate} where document_id = ${srcId}`
  await sqlClient`update doc_links set purchase_doc_id = ${targetId} where purchase_doc_id = ${srcId}`
  await sqlClient`update doc_links set sale_doc_id = ${targetId} where sale_doc_id = ${srcId}`
  await sqlClient`update payments set document_id = ${targetId} where document_id = ${srcId}`
  await sqlClient`update fin_row_alloc set doc_id = ${targetId} where doc_id = ${srcId}`
  await sqlClient`update documents set parent_doc_id = ${targetId} where parent_doc_id = ${srcId}`
  await sqlClient`update documents set origin_doc_id = ${targetId} where origin_doc_id = ${srcId}`
  await sqlClient`update orders set linked_doc_id = ${targetId} where linked_doc_id = ${srcId}`
  await sqlClient`update documents set status = 'cancelled', total = '0', merged_into = ${targetId},
      comment = trim(both ' ' from coalesce(comment, '') || ' · ОБЪЕДИНЕНА В ' || ${targetNumber})
    where id = ${srcId}`
  await sqlClient`insert into document_history (id, document_id, action, detail, user_name)
    values (gen_random_uuid(), ${srcId}, 'mergeLog', ${JSON.stringify(log)}, 'Система')`
  return log
}

// Накладные, влитые В ЭТУ (для кнопки «Разъединить»).
export const mergedSources = (targetId: string) =>
  db.select({ id: documents.id, number: documents.number, date: documents.date })
    .from(documents).where(eq(documents.mergedInto, targetId)).orderBy(desc(documents.date))

// Вернуть всё на место по записи журнала: строки, склад (своим днём), связки, оплаты, дети.
export async function unmergeDocFromLog(targetId: string, srcId: string, log: any) {
  for (const l of (log.lines || [])) {
    await sqlClient`update document_lines set document_id = ${srcId}, block = ${l.b || ''}, sort_order = ${l.so || 0}
      where id = ${l.id}`
  }
  if ((log.moves || []).length) await sqlClient`update stock_movements set document_id = ${srcId}, date = ${log.date}
    where id = any(${log.moves})`
  if ((log.linkP || []).length) await sqlClient`update doc_links set purchase_doc_id = ${srcId} where id = any(${log.linkP})`
  if ((log.linkS || []).length) await sqlClient`update doc_links set sale_doc_id = ${srcId} where id = any(${log.linkS})`
  if ((log.pays || []).length) await sqlClient`update payments set document_id = ${srcId} where id = any(${log.pays})`
  if ((log.alloc || []).length) await sqlClient`update fin_row_alloc set doc_id = ${srcId} where id = any(${log.alloc})`
  if ((log.kidsP || []).length) await sqlClient`update documents set parent_doc_id = ${srcId} where id = any(${log.kidsP})`
  if ((log.kidsO || []).length) await sqlClient`update documents set origin_doc_id = ${srcId} where id = any(${log.kidsO})`
  if ((log.cards || []).length) await sqlClient`update orders set linked_doc_id = ${srcId} where id = any(${log.cards})`
  await sqlClient`update documents set status = ${log.status || 'posted'}, total = ${String(log.total || 0)},
      comment = ${log.comment}, merged_into = null where id = ${srcId}`
}

// Запись журнала объединения (последняя) — по ней разъединяем.
export async function mergeLogOf(srcId: string) {
  const [r] = await sqlClient`select detail from document_history
    where document_id = ${srcId} and action = 'mergeLog' order by created_at desc limit 1` as unknown as Array<any>
  if (!r?.detail) return null
  try { return JSON.parse(r.detail) } catch { return null }
}

// Шапка накладной-приёмника после объединения: номер (оба рядом), сумма, вх. номера, коммент.
export async function applyMergeHead(targetId: string, number: string, total: number, inNumber: string | null, comment: string | null) {
  await sqlClient`update documents set number = ${number}, total = ${String(total)},
      in_number = ${inNumber}, comment = ${comment} where id = ${targetId}`
}
