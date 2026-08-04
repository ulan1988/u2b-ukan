import type { z } from 'zod'
import { docNumber } from '../lib/num'
import * as repo from '../repositories/order.repo'
import type { createOrderSchema } from '../dto/order.dto'
import type { Session } from '../lib/auth'

export async function createOrder(i: z.infer<typeof createOrderSchema>, actor?: Session | null) {
  const count = await repo.countByKind(i.orgId, i.kind)
  const id = docNumber(i.kind, count)                     // ЗП-/ПР-0001-DDMMYY

  const screen = i.screen || 'incoming'
  const order = {
    id, orgId: i.orgId, kind: i.kind,
    screen, block: i.block || '', status: screen === 'reception' ? 'В обработке' : 'В ожидании', source: i.source,
    fromName: i.fromName, contactId: i.contactId ?? null,
    toWarehouseId: i.toWarehouseId ?? null, comment: i.comment, phone: i.phone ?? null,
    deadline: i.deadline ? new Date(i.deadline) : null,
    trackingLink: encodeURIComponent(id),
  }
  const positions = i.positions.map((p, idx) => ({
    id: `${id}-P${idx + 1}`, cardId: id, productId: p.productId ?? null,
    name1c: p.name1c, oral: p.oral, qty: String(p.qty), unit: p.unit, price: String(p.price),
    respUserId: p.respUserId ?? null, supplierId: p.supplierId ?? null,
    deadline: p.deadline ? new Date(p.deadline) : null,
  }))
  const history = {
    cardId: id, action: 'create',
    detail: `${i.kind === 'purchase' ? 'Закуп' : 'Продажа'} создан (${positions.length} поз.)`,
    userName: actor?.name || 'Система',
  }
  await repo.insertOrderPosting(order, positions, history)
  return { id }
}

export const listByScreen = (orgId: string, screen: string) => repo.listByScreen(orgId, screen)

export const listHistory = (orgId: string) => repo.historyByOrg(orgId)

// Заявки (все экраны или один) с прикреплёнными позициями — для карточек доски/админки.
export async function listOrders(orgId: string, screen?: string) {
  const rows = screen ? await repo.listByScreen(orgId, screen) : await repo.listByOrg(orgId)
  if (!rows.length) return []
  const pos = await repo.positionsByCards(rows.map(r => r.id))
  const byCard: Record<string, any[]> = {}
  for (const p of pos) (byCard[p.cardId] ||= []).push(p)
  return rows.map(o => ({ ...o, positions: byCard[o.id] || [] }))
}

// Назначить логиста (resp) всем позициям карточки — Стол приёмки.
export async function assignLogist(cardId: string, respUserId: string, actor?: Session | null) {
  await repo.updatePositionsByCard(cardId, { respUserId })
  await repo.insertHistory({ cardId, action: 'assignLogist', detail: 'Логист назначен всем позициям', userName: actor?.name || 'Система' })
  return { ok: true }
}

// Обновить статус позиции (или всех). Логист возит: В работе→В пути→Доставлено.
// Когда все позиции доставлены — карточка готова к учёту (toacc), иначе — «В работе».
export async function setPositions(cardId: string, posId: string | undefined, status: string, actor?: Session | null) {
  if (posId) await repo.updatePosition(posId, { status })
  else await repo.updatePositionsByCard(cardId, { status })

  const positions = await repo.positionsByCard(cardId)
  const allDelivered = positions.length > 0 && positions.every(p => p.status === 'Доставлено')
  await repo.updateOrder(cardId, allDelivered
    ? { delivered: new Date(), toacc: true, status: 'Доставлено' }
    : { delivered: null, toacc: false, status: 'В работе' })
  await repo.insertHistory({
    cardId, action: 'updatePos',
    detail: posId ? `Позиция → ${status}` : `Все позиции → ${status}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true, allDelivered }
}

export async function getCard(id: string) {
  const [order] = await repo.getOrder(id)
  if (!order) return null
  const [positions, history] = await Promise.all([repo.positionsByCard(id), repo.historyByCard(id)])
  return { order, positions, history }
}
