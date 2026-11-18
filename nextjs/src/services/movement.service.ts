// «Документ движений» — одна страница-воронка: сверху заказы клиентов, ниже заказы
// поставщикам, ниже приходные и расходные. Документ спускается полосой ниже по мере
// обработки (админ обеспечил → принял → логист доставил).
//
// ЛОГИКУ НЕ МЕНЯЕМ: экран только ПОКАЗЫВАЕТ то, что уже рождают карточки и накладные —
// ни одного нового документа и ни одного движения склада здесь не создаётся. Канбан,
// автозакуп, накладные и их журналы остаются как есть (решение владельца 18.11.2026).
//
// МАТЕРИНСКИЙ НОМЕР цепочки (то самое «начало»): берём из уже существующих связей —
//   заказ клиента          → он сам;
//   заказ поставщику       → заявка-продажа из автозакупа (`procurement_links`), иначе корень
//                            дерева карточек (`parent_card_id`), иначе он сам;
//   приходная/расходная    → карточка-основание (`source_order_id`) и дальше по тем же правилам.
// Нового поля в базе пока нет — когда цепочку надо будет держать жёстко (этап 2), корень
// запишем в карточку, а не вычислим.
import * as repo from '../repositories/movement.repo'
import * as orderRepo from '../repositories/order.repo'
import { today } from '../lib/num'

const num = (n: any) => Number(n) || 0

export type MovementItem = {
  id: string; title: string; who: string; sum: number; positions?: number
  root: string; rootMore?: number; state: string; open: boolean
  date?: string; number?: string; source?: string
}

export async function movementBoard(orgId: string, day?: string) {
  const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today()

  const [openSales, closedSales, openPurch, closedPurch, purchaseDocs, saleDocs] = await Promise.all([
    repo.openOrders(orgId, 'sale'),
    repo.closedOrdersOnDay(orgId, 'sale', d),
    repo.openOrders(orgId, 'purchase'),
    repo.closedOrdersOnDay(orgId, 'purchase', d),
    repo.docsOnDay(orgId, ['purchase', 'return_in'], d),
    repo.docsOnDay(orgId, ['sale', 'return_out'], d),
  ])

  // Корни: заявки автозакупа для закупов + дерево карточек (мать → потомки).
  const purchaseIds = [...openPurch, ...closedPurch].map(p => String(p.id))
  const links = await repo.salesOfPurchases(purchaseIds)
  const salesByPurchase = new Map<string, string[]>()
  for (const l of links) {
    const arr = salesByPurchase.get(String(l.purchaseCardId)) || []
    if (!arr.includes(String(l.saleCardId))) arr.push(String(l.saleCardId))
    salesByPurchase.set(String(l.purchaseCardId), arr)
  }
  const allCards = Array.from(new Set([
    ...[...openSales, ...closedSales].map(o => String(o.id)), ...purchaseIds,
    ...[...purchaseDocs, ...saleDocs].map(x => String(x.sourceOrderId || '')).filter(Boolean),
  ]))
  const trees = await orderRepo.cardTrees(allCards)

  // Материнский номер карточки: заявки автозакупа важнее дерева — закуп делается ПОД заявку.
  const rootOf = (cardId: string): { root: string; more: number } => {
    const linked = salesByPurchase.get(cardId)
    if (linked?.length) return { root: linked[0], more: linked.length - 1 }
    return { root: trees[cardId]?.root || cardId, more: 0 }
  }

  const orderItem = (o: any, open: boolean): MovementItem => {
    // Записанный корень важнее вычисленного: у новых карточек он уже проставлен при создании.
    const { root, more } = o.rootCardId ? { root: String(o.rootCardId), more: 0 } : rootOf(String(o.id))
    return {
      id: String(o.id), number: String(o.id),
      title: o.contragent || o.fromName || '—',
      who: o.source === 'cabinet' ? 'кабинет' : o.source === 'cashier' ? 'касса' : o.source === 'branch_done' ? 'филиал' : o.source === 'client_form' ? 'клиент' : 'админ',
      sum: num(o.sum), positions: num(o.positions),
      root, rootMore: more, open,
      state: open ? (o.status || o.screen || '') : 'закрыт',
      date: o.createdAt ? String(o.createdAt).slice(0, 10) : undefined,
      source: o.source || '',
    }
  }
  const docItem = (x: any): MovementItem => {
    const card = String(x.sourceOrderId || '')
    const { root, more } = x.rootCardId ? { root: String(x.rootCardId), more: 0 } : (card ? rootOf(card) : { root: '', more: 0 })
    return {
      id: String(x.id), number: x.number, title: x.contragent || '—', who: '',
      sum: num(x.total), root, rootMore: more, open: false,
      state: x.status === 'cancelled' ? 'отменён' : x.type === 'return_in' ? 'возврат' : x.type === 'return_out' ? 'возврат' : 'проведён',
      date: String(x.date).slice(0, 10),
    }
  }

  return {
    day: d,
    orders: [...openSales.map(o => orderItem(o, true)), ...closedSales.map(o => orderItem(o, false))],
    supplierOrders: [...openPurch.map(o => orderItem(o, true)), ...closedPurch.map(o => orderItem(o, false))],
    purchases: purchaseDocs.map(docItem),
    sales: saleDocs.map(docItem),
  }
}
