import type { z } from 'zod'
import { docNumber, prodOrderNumber, today } from '../lib/num'
import * as repo from '../repositories/order.repo'
import * as userRepo from '../repositories/user.repo'
import * as refsRepo from '../repositories/refs.repo'
import * as reportRepo from '../repositories/report.repo'
import type { createOrderSchema } from '../dto/order.dto'
import type { Session } from '../lib/auth'
import { legForSupplier, legForSuppliers } from '../lib/legDetect'

// Авто-строка смены логиста при доставке позиции (как updatePos в Улкане):
// upsert по posId в СЕГОДНЯШНИЙ черновик смены логиста-ответственного.
async function addDeliveryToShift(orgId: string, pos: any, order: any) {
  if (!pos.respUserId) return
  const day = today()
  let [draft] = await reportRepo.draftForDay(orgId, pos.respUserId, day)
  if (!draft) [draft] = await reportRepo.createReport({ orgId, logistId: pos.respUserId, date: day, status: 'draft' })
  // Строка как в Улкане (updatePos): fromWho = поставщик || отправитель,
  // toWho = назначение (закуп → Центр-Склад, продажа → клиент-получатель).
  const cags = await refsRepo.listContragents()
  const cagName: Record<string, string> = {}
  for (const c of cags as any[]) cagName[c.id] = c.name
  const supplier = pos.supplierId ? (cagName[pos.supplierId] || '') : ''
  const toWho = order.kind === 'purchase' ? 'Центр-Склад' : (order.contactId ? (cagName[order.contactId] || '') : '')
  const rowData = {
    posId: pos.id, name: pos.name1c || pos.oral || '', fromWho: supplier || order.fromName || '',
    qtyIn: String(pos.qty), commentIn: '',
    toWho, qtyOut: String(pos.qty), commentOut: '', invoiceNum: '',
  }
  const rows = await reportRepo.rowsByReport(draft.id)
  const existing = rows.find((r: any) => r.posId === pos.id)
  if (existing) await reportRepo.updateRow(existing.id, rowData)
  else await reportRepo.addRow({ ...rowData, reportId: draft.id })
}

// Оповещение об изменении карточки (как postCardChange в Улкане): системная запись
// в чат карточки (видно в главном чате) + сигнал ответственным логистам (вкладка
// «⚡ Изменения») и админам + realtime-пуш. Себе не шлём.
async function notifyCardChange(cardId: string, text: string, actor?: Session | null) {
  try {
    const msgRepo = await import('../repositories/message.repo')
    await msgRepo.insert({ cardId, userId: actor?.id || null, userName: actor?.name || 'Система', role: actor?.role || 'system', text })
  } catch { /* чат не критичен */ }
  try {
    const positions = await repo.positionsByCard(cardId)
    const [o] = await repo.getOrder(cardId)
    const logistIds = Array.from(new Set(positions.map(p => p.respUserId).filter(Boolean))) as string[]
    const targets = logistIds.filter(id => id !== actor?.id)
    if (targets.length) { const { notify } = await import('./notification.service'); await notify(targets, text, cardId) }
    if (o) { const { notifyAdmins } = await import('./notifyHelpers'); await notifyAdmins(o.orgId, text, cardId, actor?.id) }
    const { pushSignal } = await import('../lib/pusherServer'); await pushSignal()
  } catch { /* уведомления не критичны */ }
}

// Запрет правок доставленной/проведённой карточки. Админ/супер-админ — в обход
// (может исправить). Остальным (логист/филиал/клиент/приёмка) — нельзя менять
// доставленное. Чтобы отредактировать — сначала откатить доставку (В работе).
async function editBlocked(cardId: string, actor?: Session | null): Promise<string | null> {
  if (actor && ['admin', 'super_admin'].includes(actor.role)) return null
  const [o] = await repo.getOrder(cardId)
  if (!o) return null
  const positions = await repo.positionsByCard(cardId)
  const allDelivered = positions.length > 0 && positions.every(p => p.status === 'Доставлено')
  if (allDelivered || o.toacc || o.posted1c || ['bookkeeping', 'archive'].includes(o.screen))
    return 'Карточка доставлена — изменения запрещены (откатите доставку, чтобы править)'
  return null
}

export async function createOrder(i: z.infer<typeof createOrderSchema>, actor?: Session | null) {
  // Заказ мастера производства → продолжающийся код ЗК-NN-DDMMYY; иначе ЗП-/ПР-0001-DDMMYY.
  const id = i.prodOrder
    ? prodOrderNumber(await repo.nextProdSeq())
    : docNumber(i.kind, await repo.countByKind(i.orgId, i.kind))

  const screen = i.screen || 'incoming'
  const order = {
    id, orgId: i.orgId, kind: i.kind,
    screen, block: i.block || '',
    status: i.isDraft ? 'Черновик' : (screen === 'reception' ? 'В обработке' : 'В ожидании'),
    source: i.source, isDraft: i.isDraft ?? false,
    fromName: i.fromName, fromId: i.fromId ?? null, contactId: i.contactId ?? null,
    specProjectId: i.specProjectId ?? null,
    toWarehouseId: i.toWarehouseId ?? null, comment: i.comment, phone: i.phone ?? null,
    deadline: i.deadline ? new Date(i.deadline) : null,
    trackingLink: encodeURIComponent(id),
  }
  // Плечо позиции по поставщику: поставщик-филиал → leg 1 (через филиал), иначе → 2.
  // Прямой заказ мастера (prodOrder) поставщика не имеет — филиал сам изготовитель, поэтому
  // его позиции по умолчанию производственные (leg 1). Иначе карточка не попадает на стол
  // мастера (isProd) и «Отправить логисту» (sendPositions ищет именно leg=1) не работает.
  const legMap = await legForSuppliers(i.positions.map(p => p.supplierId))
  const defaultLeg = i.prodOrder ? 1 : 2
  const positions = i.positions.map((p, idx) => ({
    id: `${id}-P${idx + 1}`, cardId: id, productId: p.productId ?? null,
    name1c: p.name1c, oral: p.oral, qty: String(p.qty), unit: p.unit, price: String(p.price),
    widthCm: p.widthCm != null ? String(p.widthCm) : null,
    respUserId: p.respUserId ?? null, supplierId: p.supplierId ?? null, payment: p.payment || '',
    specItemId: (p as any).specItemId ?? null,             // вынесена из позиции проекта (учёт остатка)
    leg: p.supplierId ? (legMap[p.supplierId] ?? 2) : defaultLeg,
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
  const cards = Array.from(byCard.values())
  // Продажа не видна логисту, пока связанный закуп не проведён (товар не пришёл).
  const procRepo = await import('../repositories/procurement.repo')
  const waiting = await procRepo.salesWaitingProcure(cards.filter(c => c.kind === 'sale').map(c => c.id))
  for (const c of cards) c.waitingProcure = waiting.has(c.id)
  return cards
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

// Карточки для кабинета филиала (правило двух плеч): те, где филиал — поставщик
// (leg=1, «проходят через него»). Филиал в своей отдельной орг видит ещё и карточки
// своей организации. Так поставщик-филиал получает карточку к себе.
// target — филиал «от имени» (resolveTarget): {name, orgId}. Так админ видит кабинет филиала
// именно как этот филиал (его орг + его карточки), а не под своей HQ-сессией.
export async function listForBranch(target: { name: string; orgId: string; contragentId?: string | null }) {
  const ids = new Set<string>(await repo.orderIdsBySupplierName(target.name))
  // Карточки, где поставщик = контрагент-владелец кабинета (надёжнее имени).
  if (target.contragentId) for (const id of await repo.orderIdsBySupplierId(target.contragentId)) ids.add(id)
  const { db } = await import('../lib/db')
  const { organizations } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  const [org] = await db.select({ kind: organizations.kind }).from(organizations).where(eq(organizations.id, target.orgId)).limit(1)
  if (org && org.kind !== 'hq') for (const o of await repo.listByOrg(target.orgId)) ids.add(o.id)
  return withPositions(await repo.ordersByIds(Array.from(ids)))
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
  // При доставке — авто-строка в смену логиста (собирается «Доставлено» → отчёт).
  if (status === 'Доставлено' && order) {
    const delivered = posId ? positions.filter(p => p.id === posId) : positions
    for (const p of delivered) { try { await addDeliveryToShift(order.orgId, p, order) } catch {} }
  }
  if (allDelivered) {
    // Как в 1С: на полной доставке сразу проводим документ (приходная/расходная).
    // Успех → postOrderInvoice сам ставит screen='bookkeeping' (карточка проведена, в Бухгалтерии).
    // Стадии «К учёту» в нормальном потоке нет.
    let posted = !!(order && order.linkedDocId)
    if (order && !order.linkedDocId) {
      try { const { postOrderInvoice } = await import('./invoice.service'); const r = await postOrderInvoice(cardId, actor); posted = !!(r && r.ok) } catch {}
    }
    // Провести не удалось (нет 1С-товара/поставщика) → карточка видна в «К учёту» как мост-просмотр.
    if (!posted) await repo.updateOrder(cardId, { screen: 'accounting', status: 'К учёту', toacc: true, delivered: new Date() })
  } else {
    // Откат авто-доставленной карточки — обратно в Исходящие.
    await repo.updateOrder(cardId, { delivered: null, toacc: false, status: 'В работе',
      ...(order && order.screen === 'incoming' && order.toacc ? { screen: 'outgoing' } : {}) })
  }
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
  const blk = await editBlocked(cardId, actor); if (blk) return { ok: false as const, error: blk }
  const old = (await repo.positionsByCard(cardId)).find((p: any) => p.id === posId)
  const set: Record<string, any> = {}
  if (patch.productId !== undefined) set.productId = patch.productId || null
  if (patch.name1c !== undefined) set.name1c = patch.name1c
  if (patch.oral !== undefined) set.oral = patch.oral
  if (patch.qty !== undefined) set.qty = String(patch.qty)
  if (patch.unit !== undefined) set.unit = patch.unit
  if (patch.price !== undefined) set.price = String(patch.price)
  if (patch.widthCm !== undefined) set.widthCm = patch.widthCm != null && patch.widthCm !== '' ? String(patch.widthCm) : null
  if (patch.supplierId !== undefined) { set.supplierId = patch.supplierId || null; set.leg = await legForSupplier(patch.supplierId || null) }
  if (patch.respUserId !== undefined) set.respUserId = patch.respUserId || null
  if (patch.status !== undefined) set.status = patch.status
  if (patch.payment !== undefined) set.payment = patch.payment
  if (patch.deadline !== undefined) set.deadline = patch.deadline ? new Date(patch.deadline) : null
  if (Object.keys(set).length) await repo.updatePosition(posId, set)
  await repo.insertHistory({ cardId, action: 'updatePosDetail', detail: 'Позиция изменена', userName: actor?.name || 'Система' })
  // Оповещение об изменении: кол-во / цена / наименование (в чат + логисту).
  const nm = old?.name1c || old?.oral || 'позиция'
  const ch: string[] = []
  if (patch.qty !== undefined && Number(patch.qty) !== Number(old?.qty || 0)) ch.push(`кол-во ${Number(old?.qty) || 0}→${Number(patch.qty) || 0} ${old?.unit || 'шт'}`)
  if (patch.price !== undefined && Number(patch.price) !== Number(old?.price || 0)) ch.push(`цена ${Number(old?.price) || 0}→${Number(patch.price) || 0}`)
  if (patch.name1c !== undefined && patch.name1c && patch.name1c !== old?.name1c) ch.push(`наим. → ${patch.name1c}`)
  if (patch.payment !== undefined && patch.payment !== old?.payment) ch.push(`оплата → ${patch.payment || '—'}`)
  if (ch.length) await notifyCardChange(cardId, `✏️ ${nm}: ${ch.join(', ')}`, actor)
  return { ok: true }
}

// ── Производство: этапы мастера живут в prod_phase ───────────────────────────
// Старый поток раскроя (setProdStage: '' → cut → bent, статусы «Распил»/«Листогиб»)
// удалён — он писал статус мимо prod_phase, из-за чего карточки застревали вне стола
// мастера. Актуальная цепочка: produceAccept → produceStart → produceReady → send.

// Отправка логисту (кабинет мастера): целиком или частями. Выбранные производственные
// позиции (leg=1) → leg=2 (их видит логист), карточка → экран «Исходящие». Когда leg=1
// позиций не осталось — карточка «Отправлено» (prodPhase=sent) уходит из стола мастера.
// posIds пуст/не задан → отправить все производственные позиции (целиком).
export async function sendPositions(cardId: string, posIds: string[] | undefined, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  const positions = await repo.positionsByCard(cardId)
  const leg1 = positions.filter((p: any) => Number(p.leg) === 1)
  if (!leg1.length) return { ok: false as const, error: 'Нечего отправлять' }
  const wantAll = !posIds || !posIds.length
  const targets = wantAll ? leg1 : leg1.filter((p: any) => posIds!.includes(p.id))
  if (!targets.length) return { ok: false as const, error: 'Не выбраны позиции' }
  for (const p of targets) await repo.updatePosition(p.id, { leg: 2 })
  const remaining = leg1.length - targets.length
  const patch: Record<string, any> = { screen: 'outgoing', block: '' }
  if (remaining <= 0) { patch.status = 'Отправлено'; patch.prodPhase = 'sent' }
  await repo.updateOrder(cardId, patch)
  await repo.insertHistory({
    cardId, action: 'produceSend',
    detail: remaining <= 0
      ? `Отправлено логисту${targets.length && !wantAll ? `: ${targets.length} поз.` : ''}`
      : `Отправлено логисту частично: ${targets.length} поз. (осталось ${remaining})`,
    userName: actor?.name || 'Система',
  })
  return { ok: true as const, sent: targets.length, remaining }
}

// Сплит большой карточки: выбранные позиции → НОВАЯ карточка (тот же заказчик), из исходной
// удаляются. Новая карточка = заказ мастера (ЗК-код), сразу на столе (prodPhase=accepted).
// Нужно оставить хотя бы одну позицию в исходной (иначе это не сплит, а переименование).
export async function splitCard(cardId: string, posIds: string[], actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  const positions = await repo.positionsByCard(cardId)
  const move = positions.filter((p: any) => posIds?.includes(p.id))
  if (!move.length) return { ok: false as const, error: 'Не выбраны позиции' }
  if (move.length >= positions.length) return { ok: false as const, error: 'Оставьте хотя бы одну позицию в исходной карточке' }

  const newId = prodOrderNumber(await repo.nextProdSeq())
  const newOrder: any = {
    id: newId, orgId: order.orgId, kind: order.kind, screen: 'reception', block: '',
    status: 'Принял', prodPhase: 'accepted', source: order.source || 'admin_manual',
    fromName: order.fromName || '', fromId: order.fromId ?? null, contactId: order.contactId ?? null,
    specProjectId: order.specProjectId ?? null,
    comment: order.comment || '', payment: order.payment || '', leg: order.leg ?? 2,
    trackingLink: encodeURIComponent(newId),
  }
  const newPositions = move.map((p: any, idx: number) => ({
    id: `${newId}-P${idx + 1}`, cardId: newId, productId: p.productId ?? null,
    name1c: p.name1c, oral: p.oral, qty: String(p.qty), unit: p.unit, price: String(p.price),
    widthCm: p.widthCm != null ? String(p.widthCm) : null,
    respUserId: p.respUserId ?? null, supplierId: p.supplierId ?? null, payment: p.payment || '',
    specItemId: p.specItemId ?? null, leg: p.leg ?? 1, status: p.status || 'В работе',
  }))
  const history = { cardId: newId, action: 'split', detail: `Создана из ${cardId} (${move.length} поз.)`, userName: actor?.name || 'Система' }
  await repo.insertOrderPosting(newOrder, newPositions, history)
  for (const p of move) await repo.deletePosition(p.id)
  await repo.insertHistory({ cardId, action: 'split', detail: `Вынесено в ${newId}: ${move.length} поз.`, userName: actor?.name || 'Система' })
  return { ok: true as const, id: newId, moved: move.length }
}

// Удалить позицию карточки (стол приёмки).
export async function deletePosition(cardId: string, posId: string, actor?: Session | null) {
  const blk = await editBlocked(cardId, actor); if (blk) return { ok: false as const, error: blk }
  await repo.deletePosition(posId)
  await repo.insertHistory({ cardId, action: 'deletePos', detail: 'Позиция удалена', userName: actor?.name || 'Система' })
  return { ok: true }
}

// Обновить карточку (получатель/срок/коммент/проект) — стол приёмки.
export async function updateCard(cardId: string, patch: any, actor?: Session | null) {
  const blk = await editBlocked(cardId, actor); if (blk) return { ok: false as const, error: blk }
  const [old] = await repo.getOrder(cardId)
  const set: Record<string, any> = {}
  if (patch.contactId !== undefined) set.contactId = patch.contactId || null
  if (patch.deadline !== undefined) set.deadline = patch.deadline ? new Date(patch.deadline) : null
  if (patch.comment !== undefined) set.comment = patch.comment
  if (patch.phone !== undefined) set.phone = patch.phone
  if (patch.specProjectId !== undefined) set.specProjectId = patch.specProjectId || null
  if (patch.payment !== undefined) set.payment = patch.payment || ''
  if (Object.keys(set).length) await repo.updateOrder(cardId, set)
  await repo.insertHistory({ cardId, action: 'updateCard', detail: 'Карточка обновлена', userName: actor?.name || 'Система' })
  // Оповещение об изменении карточки: комментарий / срок (в чат + логисту).
  if (patch.comment !== undefined && (patch.comment || '') !== (old?.comment || '')) await notifyCardChange(cardId, `💬 Комментарий: ${String(patch.comment || '').slice(0, 100) || '—'}`, actor)
  else if (patch.deadline !== undefined) await notifyCardChange(cardId, `📅 Срок изменён`, actor)
  return { ok: true }
}

// Добавить позицию к карточке (логист/филиал).
export async function addPosition(cardId: string, i: any, actor?: Session | null) {
  const blk = await editBlocked(cardId, actor); if (blk) return { ok: false as const, error: blk }
  const n = await repo.countPositions(cardId)
  // Плечо новой позиции: по поставщику. Без поставщика — как у соседей по карточке: в заказе
  // мастера они производственные (leg=1), и новая позиция должна уехать логисту вместе с ними.
  let leg = await legForSupplier(i.supplierId ?? null)
  if (!i.supplierId) {
    const siblings = await repo.positionsByCard(cardId)
    if (siblings.some((p: any) => Number(p.leg) === 1)) leg = 1
  }
  const [p] = await repo.insertPosition({
    id: `${cardId}-P${n + 1}`, cardId, productId: i.productId ?? null,
    name1c: i.name1c || '', oral: i.oral || i.name1c || '', qty: String(i.qty || 0), unit: i.unit || 'шт',
    price: String(i.price || 0), widthCm: i.widthCm != null ? String(i.widthCm) : null,
    supplierId: i.supplierId ?? null, respUserId: i.respUserId ?? null,
    leg, status: 'В работе',
  })
  await repo.insertHistory({ cardId, action: 'addPos', detail: `Добавлена позиция: ${i.name1c || ''}`, userName: actor?.name || 'Система' })
  // Оповещение об изменении состава: в чат карточки + сигнал логистам/админам.
  await notifyCardChange(cardId, `➕ Добавлена позиция: ${i.name1c || i.oral || 'позиция'} — ${Number(i.qty) || 0} ${i.unit || 'шт'}`, actor)
  return { ok: true, position: p }
}

// Маршрут карточки для модалки «Связки» (граф-дерево пути). Строится из стадий (screen)
// + журнала (orderHistory) + связей закуп↔продажа. Узлы: done/current/pending/returned.
// Финансы — узел «Оплата» (pending), расширяемо когда появятся оплаты.
export async function cardRoute(cardId: string) {
  const [o] = await repo.getOrder(cardId)
  if (!o) return null
  const positions = await repo.positionsByCard(cardId)
  const hist = (await repo.historyByCard(cardId)).slice().reverse() // asc по времени
  const findH = (...acts: string[]) => hist.find((h: any) => acts.includes(h.action))
  const lastH = (pred: (h: any) => boolean) => [...hist].reverse().find(pred)
  const purchase = o.kind === 'purchase'

  // Текущая стадия (уровень) по screen/флагам.
  const cur = o.screen === 'archive' ? 5
    : o.screen === 'bookkeeping' ? 5
    : o.linkedDocId ? 4
    : (o.screen === 'incoming' && o.toacc) ? 3
    : o.screen === 'outgoing' ? 2
    : o.screen === 'reception' ? 1 : 0

  const STAGES = [
    { key: 'created', label: 'Создана', h: findH('create') },
    { key: 'reception', label: 'Приёмка', h: findH('accept') },
    { key: 'outgoing', label: purchase ? 'Закуп в работе' : 'Исходящие', h: findH('process', 'logistAccept', 'branchForward', 'finalizePurchase') },
    { key: 'delivered', label: purchase ? 'Приход на склад' : 'Доставлено', h: lastH((h: any) => h.action === 'updatePos' && /Доставлено/i.test(h.detail || '')) || findH('markAll') },
    { key: 'invoice', label: purchase ? 'Приходная накладная' : 'Расходная накладная', h: findH('invoice') },
    { key: 'book', label: 'Бухгалтерия', h: findH('sendAcc', 'post1c') },
  ]

  const nodes: any[] = STAGES.map((s, i) => ({
    id: i, level: i, lane: 0, label: s.label, key: s.key,
    state: i < cur ? 'done' : i === cur ? 'current' : 'pending',
    at: s.h?.createdAt || null, user: s.h?.userName || null, detail: s.h?.detail || null,
  }))
  // Узел финансов — на будущее (pending).
  nodes.push({ id: 6, level: 6, lane: 0, label: 'Оплата', key: 'payment', state: 'pending', at: null, user: null, detail: 'Финансовый модуль — позже' })
  const edges: any[] = []
  for (let i = 0; i < 6; i++) edges.push({ from: i, to: i + 1, kind: 'normal' })

  let nid = 100
  // Плечо филиала (два плеча): если карточка проходила через филиал.
  const branchH = findH('branchAccept')
  if (branchH) {
    nodes.push({ id: nid, level: 1, lane: -1, label: 'Филиал (плечо 1)', key: 'branch', state: 'done', at: branchH.createdAt, user: branchH.userName, detail: branchH.detail })
    edges.push({ from: 1, to: nid, kind: 'normal' }); edges.push({ from: nid, to: 2, kind: 'normal' }); nid++
  }
  // Возвраты — отдельные узлы со стрелкой назад.
  hist.filter((h: any) => ['returnOut', 'returnToReception', 'branchRecall'].includes(h.action)).forEach((h: any, k: number) => {
    nodes.push({ id: nid, level: 2, lane: 1 + k, label: 'Возврат', key: 'returned', state: 'returned', at: h.createdAt, user: h.userName, detail: h.detail })
    edges.push({ from: nid, to: 0, kind: 'return' }); nid++
  })
  // Отмена.
  const cancelH = findH('cancel')
  if (cancelH) { nodes.push({ id: nid, level: cur, lane: -1, label: 'Отменён', key: 'returned', state: 'returned', at: cancelH.createdAt, user: cancelH.userName, detail: cancelH.detail }); edges.push({ from: 0, to: nid, kind: 'return' }); nid++ }

  // Связка закуп↔продажа (procurementLinks) — ветки «откуда/куда товар».
  try {
    const { db } = await import('../lib/db')
    const { procurementLinks } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const rows = purchase
      ? await db.select().from(procurementLinks).where(eq(procurementLinks.purchaseCardId, cardId))
      : await db.select().from(procurementLinks).where(eq(procurementLinks.saleCardId, cardId))
    const linkedIds = Array.from(new Set(rows.map((r: any) => purchase ? r.saleCardId : r.purchaseCardId)))
    linkedIds.forEach((lid, k) => {
      nodes.push({ id: nid, level: 0, lane: -1 - k, label: (purchase ? '📄 Продажа ' : '🛒 Закуп ') + lid, key: 'link', state: 'done', at: null, user: null, detail: 'Связанная карточка', linkCardId: lid })
      edges.push({ from: nid, to: 0, kind: 'link' }); nid++
    })
  } catch { /* связи не критичны */ }

  const { lineAmount } = await import('../lib/lineAmount')
  const sum = positions.reduce((s: number, p: any) => s + lineAmount({ name: p.name1c || p.oral, qty: p.qty, price: p.price, widthCm: p.widthCm }), 0)
  // Суть: ОТ КОГО (поставщик) → КОМУ (покупатель).
  const cags = await refsRepo.listContragents()
  const cagName: Record<string, string> = {}; for (const c of cags as any[]) cagName[c.id] = c.name
  const supId = positions.find((p: any) => p.supplierId)?.supplierId
  const supplier = supId ? (cagName[supId] || '—') : (purchase ? '—' : 'Центр-Склад')
  const buyer = purchase ? 'Центр-Склад' : (o.contactId ? (cagName[o.contactId] || o.fromName || '—') : (o.fromName || '—'))

  // ── Цепочка (как листы закуп-отчёта): Поставщик → Товар (через Центр-Склад) → Заказчик ──
  // Много поставщиков/товаров/покупателей: клик по узлу «разлетает» его цепочку.
  const chNodes: any[] = [], chEdges: any[] = []
  const supNode: Record<string, string> = {}, prodTid: Record<string, string> = {}
  positions.forEach((p: any, i: number) => {
    const sName = p.supplierId ? (cagName[p.supplierId] || '—') : (purchase ? '—' : 'Центр-Склад')
    const sk = 'sup:' + sName.toLowerCase()
    if (!supNode[sk]) { supNode[sk] = 'S' + i; chNodes.push({ id: supNode[sk], col: 0, kind: 'supplier', label: sName }) }
    const tid = 'T' + i
    chNodes.push({ id: tid, col: 1, kind: 'product', label: p.name1c || p.oral || '—', sub: `${Number(p.qty)} ${p.unit || 'шт'}` })
    chEdges.push({ from: supNode[sk], to: tid })
    prodTid[(p.name1c || p.oral || '').trim().toLowerCase()] = tid
  })
  try {
    const { db } = await import('../lib/db')
    const { procurementLinks } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const buyerNode: Record<string, string> = {}; let bi = 0
    if (purchase) {
      const rows: any[] = await db.select().from(procurementLinks).where(eq(procurementLinks.purchaseCardId, cardId))
      const saleIds = Array.from(new Set(rows.map(r => r.saleCardId)))
      const sales = await repo.ordersByIds(saleIds)
      const sName: Record<string, string> = {}; for (const s of sales as any[]) sName[s.id] = s.fromName || s.id
      for (const l of rows) {
        const bn = sName[l.saleCardId] || l.saleCardId
        const bk = 'buy:' + bn.toLowerCase()
        if (!buyerNode[bk]) { buyerNode[bk] = 'B' + (bi++); chNodes.push({ id: buyerNode[bk], col: 2, kind: 'buyer', label: bn }) }
        const tid = prodTid[(l.product || '').trim().toLowerCase()]
        if (tid) chEdges.push({ from: tid, to: buyerNode[bk], qty: Number(l.qty) })
      }
    } else {
      // продажа: покупатель — клиент карточки; все товары идут ему.
      chNodes.push({ id: 'B0', col: 2, kind: 'buyer', label: buyer })
      positions.forEach((p: any, i: number) => chEdges.push({ from: 'T' + i, to: 'B0', qty: Number(p.qty) }))
    }
  } catch { /* цепочка не критична */ }

  return {
    document: { no: o.id, kind: purchase ? 'Закуп' : 'Продажа', title: (positions[0]?.name1c || positions[0]?.oral || '') + (positions.length > 1 ? ` +${positions.length - 1}` : ''), sum, contragent: o.fromName || '—', supplier, buyer, status: o.status },
    nodes, edges,
    chain: { nodes: chNodes, edges: chEdges },
  }
}

export async function getCard(id: string) {
  const [order] = await repo.getOrder(id)
  if (!order) return null
  const [positions, history] = await Promise.all([repo.positionsByCard(id), repo.historyByCard(id)])
  return { order, positions, history }
}
