// Мост «заявка → накладная»: карточка с экрана «К учёту» превращается в ERP-документ.
// Закуп (kind purchase) → приходная накладная (createPurchase); продажа → расходная (createSale).
// После проводки карточка уходит в Бухгалтерию (posted), linkedDocId = документ.
import * as docSvc from './document.service'
import * as docRepo from '../repositories/document.repo'
import * as orderRepo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { toYMD, today } from '../lib/num'
import type { Session } from '../lib/auth'

// ПОСТАВЩИК — НАШ СКЛАД (правило владельца 23.11.2026). Контрагент «Центр-Склад» закреплён за нашим складом
// (contragents.warehouse_ref_id). Когда он стоит ПОСТАВЩИКОМ, товар уже наш и уже лежит на складе — приходная
// накладная не нужна: она давала второй приход того же товара (склад +, потом расходная −, итог 0 — проданное
// со склада не уходило) и копила несуществующий долг перед «Центр-Складом». Тот же склад — не делаем ничего,
// другой наш склад — перемещение. Дальше карточка идёт как обычно: прямой заказ рождает ПРД, расходная
// списывает товар со склада.
async function ownWarehouseOf(contragentId: string): Promise<{ whId: string; name: string } | null> {
  const [c] = await docRepo.contragentById(contragentId)
  const wid = (c as any)?.warehouseRefId
  return wid ? { whId: String(wid), name: String((c as any).name || 'наш склад') } : null
}

export async function postOrderInvoice(cardId: string, actor?: Session | null, dateOverride?: string) {
  const [o] = await orderRepo.getOrder(cardId)
  if (!o) return { ok: false as const, error: 'Заявка не найдена' }
  if (o.linkedDocId) return { ok: false as const, error: 'Накладная уже проведена' }
  // Закуп со своего склада проводится БЕЗ накладной — второй раз не проводим.
  if (o.kind === 'purchase' && (o as any).posted1c && o.status === 'Проведён') return { ok: false as const, error: 'Заявка уже проведена (поставщик — наш склад, приходная не нужна)' }

  const positions = await orderRepo.positionsByCard(cardId)
  await ensureProductIdsByName(positions, o.orgId)   // позиции без productId: подхватываем по имени, а собранный в каталоге вариант заводим карточкой (иначе строка выпадала из накладной и склад не двигался)
  const withProd = positions.filter(p => p.productId)
  if (!withProd.length) return { ok: false as const, error: 'Нет позиций с товаром из справочника' }

  const isPurchase = o.kind === 'purchase'
  // Дата документа = рабочая дата (проведение задним числом, если передана), иначе день
  // доставки (delivered), иначе сегодня. dateOverride разрешает ЛЮБУЮ дату (касса мастера).
  const acceptDate = dateOverride || (o.delivered ? toYMD(o.delivered as any) : today())
  const projectId = (o as any).specProjectId || null
  const transitAgent = (o as any).transitAgent || ''

  // ── ПОПОЗИЦИОННЫЙ ТРАНЗИТ (сквозная строка) ──────────────────────────────────────
  // Флаг на позиции `transit` (или на всей карточке `o.transit` = «все строки сквозные»).
  // Сквозные строки идут МИМО склада: у продажи — заказчику расходная (реальный долг, склад
  // не трогается по строке) + поставщику приходная (долг сквозного агента, не наш финанс);
  // у закупа — отдельная приходная без склада. Обычные строки — как всегда, со складом.
  const cardTransit = !!(o as any).transit
  const isTransit = (p: any) => cardTransit || !!(p as any).transit
  const mkLine = (p: any, price: number, transit: boolean) => ({ productId: p.productId as string, qty: Number(p.qty), price, unit: p.unit || 'шт', sourcePosId: p.id, name: p.name1c || p.oral, widthCm: p.widthCm, transit })

  const wh = isPurchase && o.toWarehouseId ? { id: o.toWarehouseId } : await refsRepo.centralWarehouse(o.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад (создайте центральный склад)' }

  const contragentId = isPurchase ? (positions.find(p => p.supplierId)?.supplierId || o.contactId) : o.contactId
  if (!contragentId) return { ok: false as const, error: isPurchase ? 'В заявке не указан поставщик' : 'В заявке не указан клиент' }

  const normalPos = withProd.filter(p => !isTransit(p))
  const transitPos = withProd.filter(p => isTransit(p))
  const numbers: string[] = []
  let mainDoc: any = null   // документ-основание карточки (linkedDocId)
  // Группы «контрагент → его строки»: по ним же потом строится зеркальная накладная.
  const docGroups: Array<{ cid: string; pos: any[] }> = []
  const ownNotes: string[] = []   // группы, где поставщик — наш склад (приходная не выписана)

  if (isPurchase) {
    // ЗАКУП: строки АТОМАРНЫ — закуп бывает смешанный (разные поставщики в одной карточке),
    // поэтому приходная выписывается на КАЖДОГО поставщика отдельно. Раньше весь закуп уходил
    // на контрагента первой строки — товар Меллиуса попадал в накладную Нипы.
    const groupBy = (ps: any[]) => {
      const m = new Map<string, any[]>()
      for (const p of ps) { const sid = (p.supplierId as string) || contragentId; const a = m.get(sid) || []; a.push(p); m.set(sid, a) }
      return Array.from(m.entries())
    }
    for (const [sid, ps] of groupBy(normalPos)) {
      // ПОСТАВЩИК — НАШ СКЛАД: приходная не нужна (см. ownWarehouseOf).
      const own = await ownWarehouseOf(sid)
      if (own) {
        if (own.whId !== String(wh.id)) {
          await docSvc.createTransfer({
            fromWarehouseId: own.whId, toWarehouseId: String(wh.id), date: acceptDate,
            lines: ps.map((p: any) => ({ productId: String(p.productId), qty: Number(p.qty), unit: p.unit || 'шт', price: Number(p.price) || 0 })),
            comment: `Перемещение по заявке ${o.id} со склада «${own.name}»`,
          } as any)
          ownNotes.push(`перемещено со склада «${own.name}»`)
        } else ownNotes.push(`поставщик — наш склад «${own.name}», товар уже на складе`)
        continue
      }
      const input: any = { orgId: o.orgId, contragentId: sid, warehouseId: wh.id, lines: ps.map(p => mkLine(p, Number(p.price) || 0, false)), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Из заявки ${o.id}`, noStock: false }
      const d = await docSvc.createPurchase(input); numbers.push(d.number); mainDoc = mainDoc || d
      docGroups.push({ cid: sid, pos: ps })
    }
    for (const [sid, ps] of groupBy(transitPos)) {
      // ПОСТАВЩИК — НАШ СКЛАД: приходная не нужна (см. ownWarehouseOf).
      const own = await ownWarehouseOf(sid)
      if (own) {
        if (false) {
          await docSvc.createTransfer({
            fromWarehouseId: own.whId, toWarehouseId: String(wh.id), date: acceptDate,
            lines: ps.map((p: any) => ({ productId: String(p.productId), qty: Number(p.qty), unit: p.unit || 'шт', price: Number(p.price) || 0 })),
            comment: `Перемещение по заявке ${o.id} со склада «${own.name}»`,
          } as any)
          ownNotes.push(`перемещено со склада «${own.name}»`)
        } else ownNotes.push(`поставщик — наш склад «${own.name}», товар уже на складе`)
        continue
      }
      const input: any = { orgId: o.orgId, contragentId: sid, warehouseId: wh.id, lines: ps.map(p => mkLine(p, Number(p.price) || 0, true)), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Сквозная · закуп мимо склада · ${o.id}`, noStock: true, transit: true, transitAgent }
      const d = await docSvc.createPurchase(input); numbers.push(d.number); mainDoc = mainDoc || d
      // Сквозная У ФИЛИАЛА: мимо НАШЕГО склада, но у него товар реально уходит — зеркало нужно.
      docGroups.push({ cid: sid, pos: ps })
    }
  } else {
    // ПРОДАЖА: заказчику ОДНА расходная на все строки (реальный долг). По сквозным строкам
    // склад не трогается (флаг transit у строки), по обычным — списывается.
    const clientLines = withProd.map(p => mkLine(p, Number(p.price) || 0, isTransit(p)))
    const input: any = { orgId: o.orgId, contragentId, warehouseId: wh.id, lines: clientLines, date: acceptDate, sourceOrderId: o.id, projectId, comment: `Из заявки ${o.id}`, noStock: false, discountSum: Number((o as any).discountSum) || 0, transit: clientLines.length > 0 && clientLines.every(l => l.transit), transitAgent }
    mainDoc = await docSvc.createSale(input); numbers.push(mainDoc.number)
    // СКВОЗНАЯ ПРОДАЖА ФИЛИАЛУ ТОЖЕ ЗЕРКАЛИТСЯ (правило владельца 20.11.2026). «Мимо склада» —
    // это про НАШ склад: товар едет от поставщика прямо покупателю. Если покупатель — наш
    // филиал (мост orgRefId), у него товар физически появляется, значит приходная ему нужна,
    // иначе лист «не доехал» (так потерялась 02-ПР-0053-101126: у Нипы прихода не было).
    // Для обычного клиента ничего не меняется — цикл ниже уходит только по мостам.
    if (withProd.length) docGroups.push({ cid: contragentId, pos: withProd })

    // Сквозные строки → приходная(ые) поставщику по costPrice (долг сквозного агента, не наш финанс).
    const bySupplier = new Map<string, any[]>()
    for (const p of transitPos) { const sid = p.supplierId as string | null; if (!sid) continue; const a = bySupplier.get(sid) || []; a.push(p); bySupplier.set(sid, a) }
    for (const [sid, ps] of Array.from(bySupplier.entries())) {
      if (await ownWarehouseOf(sid)) continue   // поставщик — наш склад: приходной нет
      const input2: any = { orgId: o.orgId, contragentId: sid, warehouseId: wh.id, lines: ps.map(p => mkLine(p, Number(p.costPrice) || 0, true)), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Сквозная · закуп у поставщика (транзит к заказчику) · ${o.id}`, noStock: true, transit: true, transitAgent }
      const d = await docSvc.createPurchase(input2); numbers.push(d.number)
    }
    if (transitPos.length) {
      const margin = transitPos.reduce((s: number, p: any) => s + Number(p.qty) * (Number(p.price) - Number(p.costPrice)), 0)
      await orderRepo.insertHistory({ cardId, action: 'invoice', detail: `Сквозные строки: ${transitPos.length} шт, маржа ${Math.round(margin)} ₸ (склад не тронут)`, userName: actor?.name || 'Система' })
    }
  }

  // Весь закуп со своего склада: накладной нет, но карточка проводится (дальше — продажа со склада).
  if (!mainDoc && !(isPurchase && ownNotes.length)) return { ok: false as const, error: 'Нет позиций для проведения' }

  // ── Зеркальная накладная в книге связанной орг (филиал-производитель) ──────────
  // Контрагент карточки привязан к другой орг (contragents.orgRefId) → создаём у него
  // ПРОТИВОПОЛОЖНУЮ накладную. Сквозные строки тоже: «мимо склада» — это про НАШ склад, у
  // филиала товар реально появляется. Логист довёз материал К производителю (продажа
  // HQ) → у него ПРИХОД; забрал изделие ОТ производителя (закуп HQ) → у него РАСХОД.
  // Зеркалим ПО ГРУППАМ (у каждого поставщика своя накладная — значит и своё зеркало).
  // ЧЕК КАССЫ МАГАЗИНА НЕ ЗЕРКАЛИТСЯ В ГОЛОВНОЙ (правило владельца). Магазин-продавец торгует
  // СВОИМ товаром со своего склада: даже если кассир ошибочно выбрал покупателем мост «Адал Строй 2»,
  // приходная у головного рождаться не должна — долг остаётся дебиторкой филиала (см. chain в payCard).
  const sellerCheck = o.source === 'cashier' && (await refsRepo.orgById(o.orgId))?.kind === 'seller'
  if (sellerCheck && docGroups.some(g => g.pos.length)) {
    try { await orderRepo.insertHistory({ cardId, action: 'invoiceMirror', detail: 'Зеркало в головной не создано: чек кассы магазина', userName: actor?.name || 'Система' }) } catch { /* журнал не критичен */ }
  }
  try {
    for (const g of docGroups) {
      if (sellerCheck) continue
      if (!g.pos.length) continue
      const [cp] = await docRepo.contragentById(g.cid)
      const refOrg = (cp as any)?.orgRefId as string | undefined
      if (!refOrg || refOrg === o.orgId) continue
      const mwh = await refsRepo.centralWarehouse(refOrg)
      const [back] = await docRepo.contragentByOrgRef(refOrg, o.orgId)   // в книге refOrg — контрагент «наша орг»
      if (!mwh || !back) continue
      // Услуги и «прочий доход» между орг не передаём — только товар (см. onlyGoodsLines).
      const mlines = await docSvc.onlyGoodsLines(g.pos.map(p => mkLine(p, Number(p.price) || 0, false)))
      if (!mlines.length) continue
      const minput: any = { orgId: refOrg, contragentId: back.id, warehouseId: mwh.id, lines: mlines, date: acceptDate, sourceOrderId: o.id, projectId, parentDocId: mainDoc.id, comment: `${isPurchase ? 'Продажа головному' : 'Приход материала'} · заявка ${o.id}` }
      const mdoc = isPurchase ? await docSvc.createSale(minput) : await docSvc.createPurchase(minput)   // HQ закуп→у него расход; HQ продажа→у него приход
      await orderRepo.insertHistory({ cardId, action: 'invoiceMirror', detail: `Зеркальная ${isPurchase ? 'расходная' : 'приходная'} у «${cp.name}»: ${mdoc.number}`, userName: actor?.name || 'Система' })
    }
  } catch { /* зеркало не должно ронять основную накладную */ }

  await orderRepo.updateOrder(cardId, { linkedDocId: mainDoc ? mainDoc.id : null, posted1c: true, screen: 'bookkeeping', status: 'Проведён' })
  // Прямой заказ: приходная проведена — товар на Центр-Складе, значит рождается ДОЧЕРНЯЯ
  // карточка-продажа ПРД (мать ЗКП остаётся с закупом и приходной, связь — parentCardId).
  // Приход пришёл: заявки, под которые собирался этот закуп, уходят логисту.
  if (isPurchase) {
    try { const { releaseSalesOfPostedPurchase } = await import('./procurement.service'); await releaseSalesOfPostedPurchase(cardId, actor) }
    catch (e) { console.error('releaseSales', cardId, e) }
  }
  if (isPurchase && (o as any).directOrder) {
    try { const { createSaleFromPurchase } = await import('./directOrder.service'); await createSaleFromPurchase(cardId, actor) }
    catch (e) { console.error('directSale', cardId, e) }
  }
  // Реальное движение проведено — снимаем резерв карточки (иначе товар остаётся «в резерве»
  // навсегда поверх фактического расхода, и «доступно» уходит в минус).
  try { const { deleteReservesByCard } = await import('../repositories/reserve.repo'); await deleteReservesByCard(cardId) } catch { /* резерв мог не создаваться */ }
  await orderRepo.insertHistory({
    cardId, action: 'invoice',
    detail: numbers.length
      ? `${isPurchase ? 'Приходная' : 'Расходная'} накладная ${numbers.join(' + ')}` + (ownNotes.length ? ` · без приходной: ${Array.from(new Set(ownNotes)).join('; ')}` : '')
      : `Проведено без приходной: ${Array.from(new Set(ownNotes)).join('; ')}`,
    userName: actor?.name || 'Система',
  })
  // ЗАКУП С ПОЛУЧАТЕЛЯМИ В СТРОКАХ: товар не оседает на складе — тем же днём уходит расходной
  // каждому получателю (а если получатель — наш склад, перемещением). Делаем это ЗДЕСЬ, на
  // проводке, поэтому работает любой путь: доставка логистом, задним числом, ручная проводка.
  // Повторная проводка не отгружает дважды (проверка по уже созданным расходным карточки).
  if (isPurchase) {
    try { const { shipPurchaseRecipients } = await import('./order.service'); await shipPurchaseRecipients(cardId, acceptDate, actor) }
    catch (e) { console.error('shipPurchaseRecipients', cardId, e) }
  }
  return { ok: true as const, number: numbers[0] }
}

// Подхватить productId по имени для позиций, где он пуст (иначе позиция выпадает из накладной).
// 1) точное имя товара из каталога;
// 2) СОБРАННЫЙ В КАТАЛОГЕ ВАРИАНТ (база + цвет/см: «Изделие 7024 19 см», «Изделия №19 белый
//    0.4мм 9003») — заводим карточку от базового товара. Правило владельца: собранный по цвету
//    товар — НОВЫЙ товар, он обязан попасть на склад, чтобы его можно было двигать и продавать.
//    Без этого строка выпадала из накладной: деньги в кассу шли, а остаток не менялся.
async function ensureProductIdsByName(positions: any[], orgId?: string) {
  const need = positions.filter(p => !p.productId && (p.name1c || p.oral))
  if (!need.length) return
  const { db } = await import('../lib/db')
  const { products } = await import('../db/schema')
  const { sql, inArray } = await import('drizzle-orm')
  const names = Array.from(new Set(need.map(p => String(p.name1c || p.oral).trim().toLowerCase())))
  const prods = await db.select({ id: products.id, name: products.name }).from(products).where(inArray(sql`lower(trim(${products.name}))`, names))
  const byName = new Map(prods.map(p => [String(p.name).trim().toLowerCase(), p.id]))
  for (const p of need) {
    const pid = byName.get(String(p.name1c || p.oral).trim().toLowerCase())
    if (pid) { p.productId = pid; try { await orderRepo.updatePosition(p.id, { productId: pid }) } catch {} }
  }
  // Остались без товара → вариант, собранный в каталоге. Заводим карточку от базового товара.
  for (const p of need.filter(x => !x.productId)) {
    const id = await ensureVariantProduct(String(p.name1c || p.oral).trim(), orgId, Number(p.costPrice) || 0)
    if (id) { p.productId = id; try { await orderRepo.updatePosition(p.id, { productId: id }) } catch {} }
  }
}

// Карточка варианта: имя позиции начинается с имени базового товара («Изделие» → «Изделие 7024
// 19 см»). Берём самую длинную подходящую базу и копируем её дерево/ед./тип — новый товар ложится
// в ту же папку номенклатуры и сразу двигается по складу. Базы нет → ничего не выдумываем.
async function ensureVariantProduct(name: string, orgId?: string, cost = 0): Promise<string | null> {
  const nm = name.trim()
  if (nm.length < 4) return null
  const { db, sqlClient } = await import('../lib/db')
  const { products } = await import('../db/schema')
  const rows = await sqlClient`
    select id, unit, category, "group", cat, subgroup, spec_type_id, price_in
    from products
    where length(trim(name)) >= 4
      and position(lower(trim(name)) in ${nm.toLowerCase()}) = 1
      and lower(trim(name)) <> ${nm.toLowerCase()}
    order by length(trim(name)) desc limit 1` as unknown as any[]
  const base = rows[0]
  if (!base) return null
  const { randomUUID } = await import('crypto')
  const { ownerOrgFor } = await import('../repositories/refs.repo')
  const id = randomUUID()
  await db.insert(products).values({
    id, name: nm, unit: base.unit || 'шт', category: base.category || 'goods',
    group: base.group || '', cat: base.cat || '', subgroup: base.subgroup || '',
    specTypeId: base.spec_type_id || null,
    variant: true,   // собранный вариант: в общей номенклатуре-шаблоне не показывается
    // Себестоимость: доля листа из строки, иначе закуп базового товара (нужна для возврата по себестоимости).
    priceIn: String(cost > 0 ? cost : Number(base.price_in) || 0),
    ownerOrgId: await ownerOrgFor(orgId),
  } as any)
  return id
}

// ── ЗАДНИМ ЧИСЛОМ: ПРИХОД + РАСХОД ОДНОЙ КНОПКОЙ (правило владельца 19.11.2026) ──────────
// Заказ прошедшего дня вводят, когда всё уже случилось: товар у поставщика взяли и заказчику
// отдали. Поэтому у карточки с ПОСТАВЩИКОМ в строке сначала рождается ПРИХОДНАЯ от поставщика
// (склад +, долг поставщику), а следом обычная расходная заказчику (склад −, долг заказчика);
// себестоимость (FIFO) цепляется за эту же приходную, потому что она проведена раньше.
// Сегодняшние карточки сюда не заходят — у них прежний маршрут: автозакуп → логист → доставка.
// СКВОЗНЫЕ строки пропускаем: у них обе накладные делает postOrderInvoice БЕЗ склада —
// только деньги и долги (drop-ship), и второй приход был бы дублем.
export async function postSupplyForCard(cardId: string, date: string, actor?: Session | null) {
  const [o] = await orderRepo.getOrder(cardId)
  if (!o || o.kind !== 'sale' || o.linkedDocId) return { ok: false as const, skipped: true }
  const positions = await orderRepo.positionsByCard(cardId)
  await ensureProductIdsByName(positions, o.orgId)
  const cardTransit = !!(o as any).transit
  const rows = positions.filter((p: any) => p.productId && p.supplierId && !(cardTransit || p.transit))
  if (!rows.length) return { ok: true as const, numbers: [] as string[] }
  const wh = await refsRepo.centralWarehouse(o.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад' }
  const { sqlClient } = await import('../lib/db')
  const ids = Array.from(new Set(rows.map((p: any) => String(p.productId))))
  const pin = new Map<string, number>()
  for (const r of (await sqlClient`select id::text id, coalesce(price_in,0)::float p from products where id = any(${ids})` as unknown as Array<any>)) pin.set(r.id, Number(r.p) || 0)
  // Цена прихода: «закуп» строки → закуп из карточки товара → цена продажи (чтобы не принять за 0).
  const costOf = (p: any) => Number(p.costPrice) || pin.get(String(p.productId)) || Number(p.price) || 0
  const projectId = (o as any).specProjectId || null
  const bySup = new Map<string, any[]>()
  for (const p of rows) { const sid = String(p.supplierId); const a = bySup.get(sid) || []; a.push(p); bySup.set(sid, a) }
  const numbers: string[] = []
  for (const [sid, ps] of Array.from(bySup.entries())) {
    // Поставщик — наш склад: товар уже лежит у нас, приход не нужен (расходная спишет его со склада).
    { const own = await ownWarehouseOf(sid); if (own && own.whId === String(wh.id)) continue }
    const lines = ps.map((p: any) => ({ productId: p.productId as string, qty: Number(p.qty), price: costOf(p), unit: p.unit || 'шт', sourcePosId: p.id, name: p.name1c || p.oral, widthCm: p.widthCm }))
    const d: any = await docSvc.createPurchase({ orgId: o.orgId, contragentId: sid, warehouseId: wh.id, lines, date, sourceOrderId: o.id, projectId, comment: `Приход от поставщика (задним числом) · ${o.id}` } as any)
    numbers.push(d.number)
    // Поставщик — другая наша орг (мост): у неё этим же днём расходная нам.
    try {
      const [cp] = await docRepo.contragentById(sid)
      const refOrg = (cp as any)?.orgRefId as string | undefined
      if (refOrg && refOrg !== o.orgId) {
        const mwh = await refsRepo.centralWarehouse(refOrg)
        const [back] = await docRepo.contragentByOrgRef(refOrg, o.orgId)
        const mlines = await docSvc.onlyGoodsLines(lines)
        if (mwh && back && mlines.length) {
          const md: any = await docSvc.createSale({ orgId: refOrg, contragentId: back.id, warehouseId: mwh.id, lines: mlines, date, sourceOrderId: o.id, projectId, parentDocId: d.id, comment: `Отгрузка нам · заявка ${o.id}` } as any)
          await orderRepo.insertHistory({ cardId, action: 'invoiceMirror', detail: `Зеркальная расходная у «${(cp as any).name}»: ${md.number}`, userName: actor?.name || 'Система' })
        }
      }
    } catch (e) { console.error('supply mirror', cardId, e) }
  }
  await orderRepo.insertHistory({ cardId, action: 'invoice', detail: `Приход от поставщика (задним числом): ${numbers.join(', ')}`, userName: actor?.name || 'Система' })
  return { ok: true as const, numbers }
}
