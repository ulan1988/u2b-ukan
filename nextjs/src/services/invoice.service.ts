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
  const lines = positions.filter(p => p.productId).map(p => ({ productId: p.productId as string, qty: Number(p.qty), price: Number(p.price), unit: p.unit || 'шт', sourcePosId: p.id }))
  if (!lines.length) return { ok: false as const, error: 'Нет позиций с товаром из справочника' }

  const isPurchase = o.kind === 'purchase'
  const wh = isPurchase && o.toWarehouseId ? { id: o.toWarehouseId } : await refsRepo.centralWarehouse(o.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад (создайте центральный склад)' }

  const contragentId = isPurchase ? (positions.find(p => p.supplierId)?.supplierId || o.contactId) : o.contactId
  if (!contragentId) return { ok: false as const, error: isPurchase ? 'В заявке не указан поставщик' : 'В заявке не указан клиент' }

  // Дата документа = день, когда логист принял/довёз (delivered), иначе сегодня.
  const acceptDate = o.delivered ? toYMD(o.delivered as any) : today()
  // И приходная, и расходная: номер авто (порядковый-дата, 01-080826), карточка-основание
  // хранится в sourceOrderId. Оба типа нумеруются одинаково (отдельные счётчики по типу).
  const input: any = { orgId: o.orgId, contragentId, warehouseId: wh.id, lines, date: acceptDate, sourceOrderId: o.id, projectId: (o as any).projectId || null, comment: `Из заявки ${o.id}` }
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
        const minput: any = { orgId: refOrg, contragentId: back.id, warehouseId: mwh.id, lines, date: acceptDate, sourceOrderId: o.id, projectId: (o as any).projectId || null, comment: `${isPurchase ? 'Продажа головному' : 'Приход материала'} · заявка ${o.id}` }
        const mdoc = isPurchase ? await docSvc.createSale(minput) : await docSvc.createPurchase(minput)   // HQ закуп→у него расход; HQ продажа→у него приход
        await orderRepo.insertHistory({ cardId, action: 'invoiceMirror', detail: `Зеркальная ${isPurchase ? 'расходная' : 'приходная'} у «${cp.name}»: ${mdoc.number}`, userName: actor?.name || 'Система' })
      }
    }
  } catch { /* зеркало не должно ронять основную накладную */ }

  await orderRepo.updateOrder(cardId, { linkedDocId: doc.id, posted1c: true, screen: 'bookkeeping', status: 'Проведён' })
  await orderRepo.insertHistory({
    cardId, action: 'invoice',
    detail: `${isPurchase ? 'Приходная' : 'Расходная'} накладная ${doc.number}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true as const, number: doc.number }
}
