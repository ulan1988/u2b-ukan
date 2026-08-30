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
  const withProd = positions.filter(p => p.productId)
  if (!withProd.length) return { ok: false as const, error: 'Нет позиций с товаром из справочника' }

  const isPurchase = o.kind === 'purchase'
  // Дата документа = день, когда логист принял/довёз (delivered), иначе сегодня.
  const acceptDate = o.delivered ? toYMD(o.delivered as any) : today()
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

  if (isPurchase) {
    // ЗАКУП: нормальные строки → приходная со складом; сквозные → приходная без склада (агент).
    if (normalPos.length) {
      const input: any = { orgId: o.orgId, contragentId, warehouseId: wh.id, lines: normalPos.map(p => mkLine(p, Number(p.price) || 0, false)), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Из заявки ${o.id}`, noStock: false }
      mainDoc = await docSvc.createPurchase(input); numbers.push(mainDoc.number)
    }
    if (transitPos.length) {
      const input: any = { orgId: o.orgId, contragentId, warehouseId: wh.id, lines: transitPos.map(p => mkLine(p, Number(p.price) || 0, true)), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Сквозная · закуп мимо склада · ${o.id}`, noStock: true, transit: true, transitAgent }
      const d = await docSvc.createPurchase(input); numbers.push(d.number); mainDoc = mainDoc || d
    }
  } else {
    // ПРОДАЖА: заказчику ОДНА расходная на все строки (реальный долг). По сквозным строкам
    // склад не трогается (флаг transit у строки), по обычным — списывается.
    const clientLines = withProd.map(p => mkLine(p, Number(p.price) || 0, isTransit(p)))
    const input: any = { orgId: o.orgId, contragentId, warehouseId: wh.id, lines: clientLines, date: acceptDate, sourceOrderId: o.id, projectId, comment: `Из заявки ${o.id}`, noStock: false }
    mainDoc = await docSvc.createSale(input); numbers.push(mainDoc.number)

    // Сквозные строки → приходная(ые) поставщику по costPrice (долг сквозного агента, не наш финанс).
    const bySupplier = new Map<string, any[]>()
    for (const p of transitPos) { const sid = p.supplierId as string | null; if (!sid) continue; const a = bySupplier.get(sid) || []; a.push(p); bySupplier.set(sid, a) }
    for (const [sid, ps] of Array.from(bySupplier.entries())) {
      const input2: any = { orgId: o.orgId, contragentId: sid, warehouseId: wh.id, lines: ps.map(p => mkLine(p, Number(p.costPrice) || 0, true)), date: acceptDate, sourceOrderId: o.id, projectId, comment: `Сквозная · закуп у поставщика (транзит к заказчику) · ${o.id}`, noStock: true, transit: true, transitAgent }
      const d = await docSvc.createPurchase(input2); numbers.push(d.number)
    }
    if (transitPos.length) {
      const margin = transitPos.reduce((s: number, p: any) => s + Number(p.qty) * (Number(p.price) - Number(p.costPrice)), 0)
      await orderRepo.insertHistory({ cardId, action: 'invoice', detail: `Сквозные строки: ${transitPos.length} шт, маржа ${Math.round(margin)} ₸ (склад не тронут)`, userName: actor?.name || 'Система' })
    }
  }

  if (!mainDoc) return { ok: false as const, error: 'Нет позиций для проведения' }

  // ── Зеркальная накладная в книге связанной орг (филиал-производитель) ──────────
  // Контрагент карточки привязан к другой орг (contragents.orgRefId) → создаём у него
  // ПРОТИВОПОЛОЖНУЮ накладную. Только по ОБЫЧНЫМ (не сквозным) строкам — сквозной товар мимо
  // склада, зеркалить его как движение нельзя. Логист довёз материал К производителю (продажа
  // HQ) → у него ПРИХОД; забрал изделие ОТ производителя (закуп HQ) → у него РАСХОД.
  try {
    const mirrorPos = isPurchase ? normalPos : normalPos   // зеркалим только складские строки
    if (mirrorPos.length) {
      const [cp] = await docRepo.contragentById(contragentId)
      const refOrg = (cp as any)?.orgRefId as string | undefined
      if (refOrg && refOrg !== o.orgId) {
        const mwh = await refsRepo.centralWarehouse(refOrg)
        const [back] = await docRepo.contragentByOrgRef(refOrg, o.orgId)   // в книге refOrg — контрагент «наша орг»
        if (mwh && back) {
          const mlines = mirrorPos.map(p => mkLine(p, Number(p.price) || 0, false))
          const minput: any = { orgId: refOrg, contragentId: back.id, warehouseId: mwh.id, lines: mlines, date: acceptDate, sourceOrderId: o.id, projectId, comment: `${isPurchase ? 'Продажа головному' : 'Приход материала'} · заявка ${o.id}` }
          const mdoc = isPurchase ? await docSvc.createSale(minput) : await docSvc.createPurchase(minput)   // HQ закуп→у него расход; HQ продажа→у него приход
          await orderRepo.insertHistory({ cardId, action: 'invoiceMirror', detail: `Зеркальная ${isPurchase ? 'расходная' : 'приходная'} у «${cp.name}»: ${mdoc.number}`, userName: actor?.name || 'Система' })
        }
      }
    }
  } catch { /* зеркало не должно ронять основную накладную */ }

  await orderRepo.updateOrder(cardId, { linkedDocId: mainDoc.id, posted1c: true, screen: 'bookkeeping', status: 'Проведён' })
  // Реальное движение проведено — снимаем резерв карточки (иначе товар остаётся «в резерве»
  // навсегда поверх фактического расхода, и «доступно» уходит в минус).
  try { const { deleteReservesByCard } = await import('../repositories/reserve.repo'); await deleteReservesByCard(cardId) } catch { /* резерв мог не создаваться */ }
  await orderRepo.insertHistory({
    cardId, action: 'invoice',
    detail: `${isPurchase ? 'Приходная' : 'Расходная'} накладная ${numbers.join(' + ')}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true as const, number: numbers[0] }
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

