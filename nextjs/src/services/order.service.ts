import type { z } from 'zod'
import { docNumber } from '../lib/num'
import * as repo from '../repositories/order.repo'
import type { createOrderSchema } from '../dto/order.dto'
import type { Session } from '../lib/auth'

export async function createOrder(i: z.infer<typeof createOrderSchema>, actor?: Session | null) {
  const count = await repo.countByKind(i.orgId, i.kind)
  const id = docNumber(i.kind, count)                     // ЗП-/ПР-0001-DDMMYY

  const order = {
    id, orgId: i.orgId, kind: i.kind,
    screen: 'incoming', status: 'В ожидании', source: i.source,
    fromName: i.fromName, contactId: i.contactId ?? null,
    toWarehouseId: i.toWarehouseId ?? null, comment: i.comment, phone: i.phone ?? null,
    trackingLink: encodeURIComponent(id),
  }
  const positions = i.positions.map((p, idx) => ({
    id: `${id}-P${idx + 1}`, cardId: id, productId: p.productId ?? null,
    name1c: p.name1c, oral: p.oral, qty: String(p.qty), unit: p.unit, price: String(p.price),
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

export async function getCard(id: string) {
  const [order] = await repo.getOrder(id)
  if (!order) return null
  const [positions, history] = await Promise.all([repo.positionsByCard(id), repo.historyByCard(id)])
  return { order, positions, history }
}
