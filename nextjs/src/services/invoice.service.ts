// Мост «заявка → накладная»: карточка с экрана «К учёту» превращается в ERP-документ.
// Закуп (kind purchase) → приходная накладная (createPurchase); продажа → расходная (createSale).
// После проводки карточка уходит в Бухгалтерию (posted), linkedDocId = документ.
import * as docSvc from './document.service'
import * as orderRepo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { toYMD, today } from '../lib/num'
import type { Session } from '../lib/auth'

export async function postOrderInvoice(cardId: string, actor?: Session | null) {
  const [o] = await orderRepo.getOrder(cardId)
  if (!o) return { ok: false as const, error: 'Заявка не найдена' }
  if (o.linkedDocId) return { ok: false as const, error: 'Накладная уже проведена' }

  const positions = await orderRepo.positionsByCard(cardId)
  const lines = positions.filter(p => p.productId).map(p => ({ productId: p.productId as string, qty: Number(p.qty), price: Number(p.price), unit: p.unit || 'шт' }))
  if (!lines.length) return { ok: false as const, error: 'Нет позиций с товаром из справочника' }

  const isPurchase = o.kind === 'purchase'
  const wh = isPurchase && o.toWarehouseId ? { id: o.toWarehouseId } : await refsRepo.centralWarehouse(o.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад (создайте центральный склад)' }

  const contragentId = isPurchase ? (positions.find(p => p.supplierId)?.supplierId || o.contactId) : o.contactId
  if (!contragentId) return { ok: false as const, error: isPurchase ? 'В заявке не указан поставщик' : 'В заявке не указан клиент' }

  // Дата документа = день, когда логист принял/довёз (delivered), иначе сегодня.
  const acceptDate = o.delivered ? toYMD(o.delivered as any) : today()
  // Приходная: номер авто (порядковый-дата, 01-060826), карточка-основание — в комментарии.
  // Расходная: пока прежняя схема (номер карточки).
  const input: any = { orgId: o.orgId, contragentId, warehouseId: wh.id, lines, date: acceptDate, sourceOrderId: o.id, comment: `Из заявки ${o.id}` }
  if (!isPurchase) input.number = o.id
  const doc = isPurchase ? await docSvc.createPurchase(input) : await docSvc.createSale(input)

  await orderRepo.updateOrder(cardId, { linkedDocId: doc.id, posted1c: true, screen: 'bookkeeping', status: 'Проведён' })
  await orderRepo.insertHistory({
    cardId, action: 'invoice',
    detail: `${isPurchase ? 'Приходная' : 'Расходная'} накладная ${doc.number}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true as const, number: doc.number }
}
