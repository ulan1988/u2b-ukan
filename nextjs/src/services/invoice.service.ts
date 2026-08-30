// Мост «заявка → накладная»: карточка с экрана «К учёту» превращается в ERP-документ.
// Закуп (kind purchase) → приходная накладная (createPurchase); продажа → расходная (createSale).
// После проводки карточка уходит в Бухгалтерию (posted), linkedDocId = документ.
import * as docSvc from './document.service'
import * as docRepo from '../repositories/document.repo'
import * as orderRepo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { toYMD, today } from '../lib/num'
import type { Session } from '../lib/auth'

export async function postOrderInvoice(cardId: string, actor?: Session | null) {
  const [o] = await orderRepo.getOrder(cardId)
  if (!o) return { ok: false as const, error: 'Заявка не найдена' }
  if (o.linkedDocId) return { ok: false as const, error: 'Накладная уже проведена' }

  const positions = await orderRepo.positionsByCard(cardId)
  await ensureProductIdsByName(positions)   // позиции без productId, но с совпадающим именем товара — подхватываем (иначе выпадали из накладной)
  const lines = positions.filter(p => p.productId).map(p => ({ productId: p.productId as string, qty: Number(p.qty), price: Number(p.price), unit: p.unit || 'шт', sourcePosId: p.id, name: p.name1c || p.oral, widthCm: p.widthCm }))
  if (!lines.length) return { ok: false as const, error: 'Нет позиций с товаром из справочника' }

  // ── СКВОЗНАЯ ПРОДАЖА (drop-ship): товар мимо склада, только деньги/долги ──────────
  // Расходная заказчику (продажа, по price) + закуп поставщику (по costPrice) — обе БЕЗ склада.
  // Дебиторка заказчика += продажа; кредиторка поставщика += закуп; маржа = продажа − закуп.
  if ((o as any).transit && o.kind === 'sale') return postTransitSale(o, positions, actor)

  const isPurchase = o.kind === 'purchase'
  const wh = isPurchase && o.toWarehouseId ? { id: o.toWarehouseId } : await refsRepo.centralWarehouse(o.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад (создайте центральный склад)' }

  const contragentId = isPurchase ? (positions.find(p => p.supplierId)?.supplierId || o.contactId) : o.contactId
  if (!contragentId) return { ok: false as const, error: isPurchase ? 'В заявке не указан поставщик' : 'В заявке не указан клиент' }

  // Дата документа = день, когда логист принял/довёз (delivered), иначе сегодня.
  const acceptDate = o.delivered ? toYMD(o.delivered as any) : today()
  // И приходная, и расходная: номер авто (порядковый-дата, 01-080826), карточка-основание
  // хранится в sourceOrderId. Оба типа нумеруются одинаково (отдельные счётчики по типу).
  // Сквозная (транзит) — склад НЕ трогаем (кредиторка/дебиторка есть, движения нет).
  const noStock = !!(o as any).transit
  const input: any = { orgId: o.orgId, contragentId, warehouseId: wh.id, lines, date: acceptDate, sourceOrderId: o.id, projectId: (o as any).specProjectId || null, comment: `${noStock ? 'Сквозная · ' : ''}Из заявки ${o.id}`, noStock }
  const doc = isPurchase ? await docSvc.createPurchase(input) : await docSvc.createSale(input)

  // ── Зеркальная накладная в книге связанной орг (филиал-производитель) ──────────
  // Контрагент карточки привязан к другой орг (contragents.orgRefId) → создаём у него
  // ПРОТИВОПОЛОЖНУЮ накладную. Логист довёз материал К производителю (продажа HQ) → у него
  // ПРИХОД; забрал изделие ОТ производителя (закуп HQ) → у него РАСХОД. Всё по факту доставки.
  try {
    const [cp] = await docRepo.contragentById(contragentId)
    const refOrg = (cp as any)?.orgRefId as string | undefined
    if (refOrg && refOrg !== o.orgId) {
      const mwh = await refsRepo.centralWarehouse(refOrg)
      const [back] = await docRepo.contragentByOrgRef(refOrg, o.orgId)   // в книге refOrg — контрагент «наша орг»
      if (mwh && back) {
        const minput: any = { orgId: refOrg, contragentId: back.id, warehouseId: mwh.id, lines, date: acceptDate, sourceOrderId: o.id, projectId: (o as any).specProjectId || null, comment: `${isPurchase ? 'Продажа головному' : 'Приход материала'} · заявка ${o.id}` }
        const mdoc = isPurchase ? await docSvc.createSale(minput) : await docSvc.createPurchase(minput)   // HQ закуп→у него расход; HQ продажа→у него приход
        await orderRepo.insertHistory({ cardId, action: 'invoiceMirror', detail: `Зеркальная ${isPurchase ? 'расходная' : 'приходная'} у «${cp.name}»: ${mdoc.number}`, userName: actor?.name || 'Система' })
      }
    }
  } catch { /* зеркало не должно ронять основную накладную */ }

  await orderRepo.updateOrder(cardId, { linkedDocId: doc.id, posted1c: true, screen: 'bookkeeping', status: 'Проведён' })
  // Реальное движение проведено — снимаем резерв карточки (иначе товар остаётся «в резерве»
  // навсегда поверх фактического расхода, и «доступно» уходит в минус).
  try { const { deleteReservesByCard } = await import('../repositories/reserve.repo'); await deleteReservesByCard(cardId) } catch { /* резерв мог не создаваться */ }
  await orderRepo.insertHistory({
    cardId, action: 'invoice',
    detail: `${isPurchase ? 'Приходная' : 'Расходная'} накладная ${doc.number}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true as const, number: doc.number }
}

// Подхватить productId по имени для позиций, где он пуст (иначе позиция выпадает из накладной).
// Матчим по точному имени товара из каталога; если товара нет — позиция остаётся без productId
// (её в документ включить нельзя — нужен товар в номенклатуре).
async function ensureProductIdsByName(positions: any[]) {
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
}

// Сквозная продажа: две накладные БЕЗ склада. Расходная заказчику (price) → его дебиторка;
// закуп поставщику (costPrice) → кредиторка поставщика. Товар на склад не приходует/не списывает.
async function postTransitSale(o: any, positions: any[], actor?: Session | null) {
  await ensureProductIdsByName(positions)   // подхватить товар по имени, иначе позиция выпадёт из накладной
  const wh = await refsRepo.centralWarehouse(o.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад орг' }
  const clientId = o.contactId
  const supplierId = positions.find((p: any) => p.supplierId)?.supplierId
  if (!clientId) return { ok: false as const, error: 'Сквозная: не указан заказчик' }
  if (!supplierId) return { ok: false as const, error: 'Сквозная: не указан поставщик (у кого берём товар)' }
  const withProd = positions.filter((p: any) => p.productId)
  if (!withProd.length) return { ok: false as const, error: 'Нет позиций с товаром из справочника' }
  const acceptDate = o.delivered ? toYMD(o.delivered as any) : today()
  const base = (price: (p: any) => number) => withProd.map((p: any) => ({ productId: p.productId as string, qty: Number(p.qty), price: price(p), unit: p.unit || 'шт', sourcePosId: p.id, name: p.name1c || p.oral, widthCm: p.widthCm }))
  const projectId = o.specProjectId || null

  // 1) Продажа заказчику (дебиторка) — по продажной цене, без склада.
  const saleDoc = await docSvc.createSale({ orgId: o.orgId, contragentId: clientId, warehouseId: wh.id, lines: base(p => Number(p.price) || 0), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Сквозная · продажа (транзит от поставщика) · ${o.id}`, noStock: true } as any)
  // 2) Закуп у поставщика (кредиторка) — по закупочной цене, без склада.
  const buyDoc = await docSvc.createPurchase({ orgId: o.orgId, contragentId: supplierId, warehouseId: wh.id, lines: base(p => Number(p.costPrice) || 0), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Сквозная · закуп у поставщика (транзит к заказчику) · ${o.id}`, noStock: true } as any)

  const margin = withProd.reduce((s: number, p: any) => s + Number(p.qty) * (Number(p.price) - Number(p.costPrice)), 0)
  await orderRepo.updateOrder(o.id, { linkedDocId: saleDoc.id, posted1c: true, screen: 'bookkeeping', status: 'Проведён' })
  try { const { deleteReservesByCard } = await import('../repositories/reserve.repo'); await deleteReservesByCard(o.id) } catch {}
  await orderRepo.insertHistory({ cardId: o.id, action: 'invoice', detail: `Сквозная: продажа ${saleDoc.number} + закуп ${buyDoc.number}, маржа ${Math.round(margin)} ₸ (склад не тронут)`, userName: actor?.name || 'Система' })
  return { ok: true as const, number: saleDoc.number }
}
