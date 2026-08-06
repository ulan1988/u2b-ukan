import type { z } from 'zod'
import { docNumber } from '../lib/num'
import * as repo from '../repositories/order.repo'
import * as userRepo from '../repositories/user.repo'
import * as refsRepo from '../repositories/refs.repo'
import type { createOrderSchema } from '../dto/order.dto'
import type { Session } from '../lib/auth'

export async function createOrder(i: z.infer<typeof createOrderSchema>, actor?: Session | null) {
  const count = await repo.countByKind(i.orgId, i.kind)
  const id = docNumber(i.kind, count)                     // ЗП-/ПР-0001-DDMMYY

  const screen = i.screen || 'incoming'
  const order = {
    id, orgId: i.orgId, kind: i.kind,
    screen, block: i.block || '',
    status: i.isDraft ? 'Черновик' : (screen === 'reception' ? 'В обработке' : 'В ожидании'),
    source: i.source, isDraft: i.isDraft ?? false,
    fromName: i.fromName, fromId: i.fromId ?? null, contactId: i.contactId ?? null,
    projectId: i.projectId ?? null, specProjectId: i.specProjectId ?? null,
    toWarehouseId: i.toWarehouseId ?? null, comment: i.comment, phone: i.phone ?? null,
    deadline: i.deadline ? new Date(i.deadline) : null,
    trackingLink: encodeURIComponent(id),
  }
  const positions = i.positions.map((p, idx) => ({
    id: `${id}-P${idx + 1}`, cardId: id, productId: p.productId ?? null,
    name1c: p.name1c, oral: p.oral, qty: String(p.qty), unit: p.unit, price: String(p.price),
    respUserId: p.respUserId ?? null, supplierId: p.supplierId ?? null, payment: p.payment || '',
    deadline: p.deadline ? new Date(p.deadline) : null,
  }))
  const history = {
    cardId: id, action: 'create',
    detail: `${i.kind === 'purchase' ? 'Закуп' : 'Продажа'} создан (${positions.length} поз.)`,
    userName: actor?.name || 'Система',
  }
  await repo.insertOrderPosting(order, positions, history)
  // Новая заявка из кабинета/сайта → уведомить админов.
  if (i.source === 'cabinet' || i.source === 'external') {
    try { const { notifyAdmins } = await import('./notifyHelpers'); await notifyAdmins(i.orgId, `🆕 Новая заявка ${id} от ${i.fromName || 'клиента'}`, id) } catch {}
  }
  return { id }
}

export const listByScreen = (orgId: string, screen: string) => repo.listByScreen(orgId, screen)

export const listHistory = (orgId: string, f: { user?: string; from?: string; to?: string } = {}) => repo.historyByOrg(orgId, f)

// Портал логиста: его карточки, в каждой — только его позиции.
export async function listForLogist(orgId: string, userId: string) {
  const rows = await repo.positionsForLogist(orgId, userId)
  const byCard = new Map<string, any>()
  for (const r of rows) {
    if (!byCard.has(r.o.id)) byCard.set(r.o.id, { ...r.o, positions: [] })
    byCard.get(r.o.id).positions.push(r.p)
  }
  return Array.from(byCard.values())
}

// Прикрепить позиции к списку карточек + резолв имён (логист/поставщик/получатель),
// чтобы карточки Улкана рисовались 1:1 (маршрут from→to, «resp · supplier» в позиции).
async function withPositions(rows: any[]) {
  if (!rows.length) return []
  const [pos, users, cags] = await Promise.all([
    repo.positionsByCards(rows.map(r => r.id)),
    userRepo.listUsers(),
    refsRepo.listContragents(),
  ])
  const userName: Record<string, string> = {}
  for (const u of users as any[]) userName[u.id] = u.name
  const cagName: Record<string, string> = {}
  for (const c of cags as any[]) cagName[c.id] = c.name
  const byCard: Record<string, any[]> = {}
  for (const p of pos) {
    (byCard[p.cardId] ||= []).push({
      ...p,
      resp: p.respUserId ? (userName[p.respUserId] || '') : '',
      supplier: p.supplierId ? (cagName[p.supplierId] || '') : '',
    })
  }
  return rows.map(o => ({
    ...o,
    positions: byCard[o.id] || [],
    // Пункт назначения: закуп → Центр-Склад, продажа → клиент-получатель.
    toName: o.kind === 'purchase' ? 'Центр-Склад' : (o.contactId ? (cagName[o.contactId] || '') : ''),
  }))
}

// Заявки (все экраны или один) с позициями — для доски/админки.
export async function listOrders(orgId: string, screen?: string) {
  return withPositions(screen ? await repo.listByScreen(orgId, screen) : await repo.listByOrg(orgId))
}

// Заявки клиента (кабинет): созданные им (fromId).
export async function listForClient(orgId: string, userId: string) {
  return withPositions(await repo.ordersForClient(orgId, userId))
}

// «Провести все»: карточки К учёту (кроме отложенных) → в бухгалтерию.
export async function postAllToBook(orgId: string) {
  const r = await repo.postAllAccounting(orgId)
  return { ok: true, count: r.length }
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
  const [order] = await repo.getOrder(cardId)
  // Все доставлены → карточка едет к учёту (incoming+toacc). Откат авто-доставленной
  // карточки возвращает её в Исходящие (как updatePos в Улкане).
  await repo.updateOrder(cardId, allDelivered
    ? { screen: 'incoming', delivered: new Date(), toacc: true, status: 'Доставлено' }
    : { delivered: null, toacc: false, status: 'В работе',
        ...(order && order.screen === 'incoming' && order.toacc ? { screen: 'outgoing' } : {}) })
  await repo.insertHistory({
    cardId, action: 'updatePos',
    detail: posId ? `Позиция → ${status}` : `Все позиции → ${status}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true, allDelivered }
}

// Публичный трекинг: статус заявки по номеру (этап, позиции, детали, история).
const STAGE_BY_SCREEN: Record<string, number> = { incoming: 1, reception: 2, outgoing: 3, accounting: 4, bookkeeping: 5, archive: 5 }
export async function track(id: string) {
  const card = await getCard(id)
  if (!card) return null
  const o = card.order
  const positions = card.positions.map((p: any) => ({ id: p.id, name: p.name1c || p.oral || '—', qty: Number(p.qty), unit: p.unit, status: p.status }))
  const done = positions.filter((p: any) => p.status === 'Доставлено').length
  const progress = positions.length ? Math.round((done / positions.length) * 100) : (o.screen === 'archive' || o.screen === 'bookkeeping' ? 100 : 0)
  const stage = o.toacc && o.screen === 'incoming' ? 4 : (STAGE_BY_SCREEN[o.screen] || 1)
  const details = [
    { k: 'Заказчик', v: o.fromName || '—' },
    { k: 'Тип', v: o.kind === 'purchase' ? 'Закуп' : 'Продажа' },
    { k: 'Создан', v: o.createdAt ? new Date(o.createdAt).toLocaleDateString('ru-RU') : '—' },
    ...(o.deadline ? [{ k: 'Срок', v: new Date(o.deadline).toLocaleDateString('ru-RU') }] : []),
  ]
  const history = card.history.map((h: any) => ({ action: h.detail || h.action, time: h.createdAt }))
  return {
    id: o.id, status: o.status, stage, progress,
    cancelled: o.isCancelled, cancelReason: o.cancelReason, legStage: null,
    positions, details, history,
  }
}

// Публичный запрос изменения по заявке (лид/клиент с трекинга).
export async function requestChange(cardId: string, text: string, phone?: string) {
  const [o] = await repo.getOrder(cardId)
  if (!o) return { ok: false as const, error: 'Заявка не найдена' }
  await repo.updateOrder(cardId, { isChanged: true, changeText: text || '', changePhone: phone || '' })
  await repo.insertHistory({ cardId, action: 'changeRequest', detail: `Запрос изменения: ${text}`, userName: 'Клиент (трекинг)' })
  try { const { notifyAdmins } = await import('./notifyHelpers'); await notifyAdmins(o.orgId, `⚡ Запрос изменения по ${cardId}: ${text.slice(0, 60)}`, cardId) } catch {}
  return { ok: true as const }
}

// Частичное обновление позиции (логист меняет поставщика/кол-во/имя). Непереданное не трогаем.
export async function updatePositionDetail(cardId: string, posId: string, patch: any, actor?: Session | null) {
  const set: Record<string, any> = {}
  if (patch.name1c !== undefined) set.name1c = patch.name1c
  if (patch.oral !== undefined) set.oral = patch.oral
  if (patch.qty !== undefined) set.qty = String(patch.qty)
  if (patch.unit !== undefined) set.unit = patch.unit
  if (patch.price !== undefined) set.price = String(patch.price)
  if (patch.supplierId !== undefined) set.supplierId = patch.supplierId || null
  if (patch.respUserId !== undefined) set.respUserId = patch.respUserId || null
  if (patch.status !== undefined) set.status = patch.status
  if (patch.payment !== undefined) set.payment = patch.payment
  if (patch.deadline !== undefined) set.deadline = patch.deadline ? new Date(patch.deadline) : null
  if (Object.keys(set).length) await repo.updatePosition(posId, set)
  await repo.insertHistory({ cardId, action: 'updatePosDetail', detail: 'Позиция изменена', userName: actor?.name || 'Система' })
  return { ok: true }
}

// Удалить позицию карточки (стол приёмки).
export async function deletePosition(cardId: string, posId: string, actor?: Session | null) {
  await repo.deletePosition(posId)
  await repo.insertHistory({ cardId, action: 'deletePos', detail: 'Позиция удалена', userName: actor?.name || 'Система' })
  return { ok: true }
}

// Обновить карточку (получатель/срок/коммент/проект) — стол приёмки.
export async function updateCard(cardId: string, patch: any, actor?: Session | null) {
  const set: Record<string, any> = {}
  if (patch.contactId !== undefined) set.contactId = patch.contactId || null
  if (patch.deadline !== undefined) set.deadline = patch.deadline ? new Date(patch.deadline) : null
  if (patch.comment !== undefined) set.comment = patch.comment
  if (patch.phone !== undefined) set.phone = patch.phone
  if (patch.projectId !== undefined) set.projectId = patch.projectId || null
  if (patch.specProjectId !== undefined) set.specProjectId = patch.specProjectId || null
  if (Object.keys(set).length) await repo.updateOrder(cardId, set)
  await repo.insertHistory({ cardId, action: 'updateCard', detail: 'Карточка обновлена', userName: actor?.name || 'Система' })
  return { ok: true }
}

// Добавить позицию к карточке (логист/филиал).
export async function addPosition(cardId: string, i: any, actor?: Session | null) {
  const n = await repo.countPositions(cardId)
  const [p] = await repo.insertPosition({
    id: `${cardId}-P${n + 1}`, cardId, productId: i.productId ?? null,
    name1c: i.name1c || '', oral: i.oral || i.name1c || '', qty: String(i.qty || 0), unit: i.unit || 'шт',
    price: String(i.price || 0), supplierId: i.supplierId ?? null, respUserId: i.respUserId ?? null, status: 'В работе',
  })
  await repo.insertHistory({ cardId, action: 'addPos', detail: `Добавлена позиция: ${i.name1c || ''}`, userName: actor?.name || 'Система' })
  // Уведомить админов об изменении состава.
  try { const { notifyAdmins } = await import('./notifyHelpers'); const [o] = await repo.getOrder(cardId); if (o) await notifyAdmins(o.orgId, `⚡ ${actor?.name || 'Логист'} добавил позицию в ${cardId}`, cardId, actor?.id) } catch {}
  return { ok: true, position: p }
}

export async function getCard(id: string) {
  const [order] = await repo.getOrder(id)
  if (!order) return null
  const [positions, history] = await Promise.all([repo.positionsByCard(id), repo.historyByCard(id)])
  return { order, positions, history }
}
