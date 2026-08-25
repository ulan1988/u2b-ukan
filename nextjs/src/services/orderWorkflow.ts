// Жизненный цикл карточки — декларативная карта переходов (как orderWorkflow.ts в UKan,
// но чисто по слоям). Диспетчер: getOrder → roles → guard → patch → history.
import * as repo from '../repositories/order.repo'
import { applyDefaults } from './categoryRule.service'
import type { Session } from '../lib/auth'

interface Ctx {
  order: any
  positions: any[]
  actor?: Session | null
  payload: Record<string, any>
}
interface Transition {
  roles?: string[]
  guard?: (c: Ctx) => string | null              // текст ошибки или null
  patch: (c: Ctx) => Record<string, any>
  history: (c: Ctx) => string
}

const ADMIN = ['admin', 'super_admin', 'bookkeeper']

export const TRANSITIONS: Record<string, Transition> = {
  accept: {
    roles: ADMIN,
    patch: () => ({ screen: 'reception', block: 'waiting', status: 'Принят' }),
    history: () => 'Принят в приёмку',
  },
  take: {
    roles: ADMIN,
    patch: () => ({ block: 'processing', status: 'В обработке' }),
    history: () => 'Взят в обработку',
  },
  process: {
    roles: ADMIN,
    guard: c => (c.positions.length && c.positions.every(p => p.respUserId) ? null : 'У всех позиций должен быть логист'),
    patch: () => ({ screen: 'outgoing', block: '', status: 'В работе' }),
    history: () => 'Отправлен в работу (Исходящие)',
  },
  // Логист сам принимает готовую продажу со стола Приёмки → в Исходящие (автозакуп
  // уже проставил поставщика/цену/логиста). Убирается из Приёмки, идёт в его работу.
  logistAccept: {
    roles: [...ADMIN, 'logist'],
    guard: c => {
      if (c.order.kind !== 'sale') return 'Только продажа'
      if (c.order.screen !== 'reception') return 'Карточка не на приёмке'
      if (!(c.positions.length && c.positions.every(p => p.respUserId))) return 'Не все позиции готовы (нет логиста)'
      return null
    },
    patch: () => ({ screen: 'outgoing', block: '', status: 'В работе' }),
    history: c => `Логист ${c.actor?.name || ''} принял продажу → Исходящие`,
  },
  sendAcc: {
    roles: ADMIN,
    guard: c => (c.order.toacc ? null : 'Карточка ещё не готова к учёту'),
    patch: () => ({ screen: 'accounting', status: 'К учёту' }),
    history: () => 'Отправлен в учёт',
  },
  postAcc: {
    roles: ADMIN,
    patch: () => ({ screen: 'bookkeeping', status: 'В бухгалтерии', toacc: false }),
    history: () => 'Проведён в бухгалтерию',
  },
  // Бухгалтерия → архив: только после проведения в 1С (как в Улкане).
  sendArchive: {
    roles: ADMIN,
    guard: c => (c.order.posted1c ? null : 'Сначала проведите в 1С'),
    patch: () => ({ screen: 'archive', status: 'Архив' }),
    history: () => 'Отправлен в архив',
  },
  unarchive: {
    roles: ADMIN,
    patch: () => ({ screen: 'bookkeeping', status: 'В бухгалтерии', cold: false }),
    history: () => 'Возврат из архива',
  },
  returnToIncoming: {
    roles: ADMIN,
    patch: () => ({ screen: 'incoming', block: '', status: 'В ожидании', toacc: false }),
    history: () => 'Возврат во Входящие',
  },
  // Массово: все позиции доставлены → карточка едет к учёту (toacc, экран incoming).
  markAll: {
    roles: ADMIN,
    patch: () => ({ screen: 'incoming', status: 'Доставлено', toacc: true, delivered: new Date() }),
    history: () => 'Все позиции доставлены',
  },
  // Исходящие → Входящие (позиции сброшены, кроме плеча филиала).
  returnOut: {
    roles: ADMIN,
    guard: c => (c.order.screen === 'outgoing' ? null : 'Карточка не в Исходящих'),
    patch: () => ({ screen: 'incoming', block: '', status: 'В ожидании', toacc: false, delivered: null }),
    history: () => 'Возвращён из исходящих, позиции сброшены',
  },
  // Исходящие → стол приёмки (позиции сброшены, кроме плеча филиала).
  returnToReception: {
    roles: ADMIN,
    guard: c => (c.order.screen === 'outgoing' ? null : 'Карточка не в Исходящих'),
    patch: () => ({ screen: 'reception', block: 'processing', status: 'В обработке', toacc: false, delivered: null }),
    history: () => 'Возвращён на стол приёмки',
  },
  // Бухгалтерия → К учёту.
  returnToAcc: {
    roles: ADMIN,
    guard: c => (c.order.screen === 'bookkeeping' ? null : 'Карточка не в бухгалтерии'),
    patch: () => ({ screen: 'accounting', status: 'К учёту', toacc: true }),
    history: () => 'Возвращён к учёту',
  },
  // Входящие(доставлено) → Исходящие (переоткрыть доставку).
  reopenOutgoing: {
    roles: ADMIN,
    patch: () => ({ screen: 'outgoing', status: 'В работе', toacc: false, delivered: null }),
    history: () => 'Возвращён в Исходящие',
  },
  // Принять изменение клиента.
  confirmChg: {
    roles: ADMIN,
    patch: () => ({ isChanged: false, changeText: '', changePhone: '' }),
    history: () => 'Изменение подтверждено',
  },
  // Сформировать счёт / счёт-фактуру — выставляем флаг карточки.
  createDoc: {
    roles: ADMIN,
    patch: () => ({ invoice: true }),
    history: () => 'Счёт сформирован',
  },
  createDocFact: {
    roles: ADMIN,
    patch: () => ({ fact: true }),
    history: () => 'Счёт-фактура сформирована',
  },
  // Провести в 1С.
  post1c: {
    roles: ADMIN,
    patch: () => ({ posted1c: true }),
    history: () => 'Проведён в 1С',
  },
  postpone: {
    roles: ADMIN,
    patch: c => ({ postponed: !c.order.postponed }),
    history: c => (c.order.postponed ? 'Снят с отложенных' : 'Отложен'),
  },
  branchAccept: {
    patch: () => ({ status: 'Принято филиалом' }),
    history: () => 'Принято филиалом',
  },
  branchForward: {
    patch: () => ({ screen: 'outgoing', block: '', status: 'В работе' }),
    history: () => 'Филиал передал логисту',
  },
  branchRecall: {
    patch: () => ({ screen: 'reception', block: 'processing', status: 'В обработке' }),
    history: () => 'Филиал вернул заявку',
  },
  // Производитель — поток мастера (без раскроя): Принял → В работе → Готов к доставке → Отправлено.
  // Этап живёт в prodPhase (не конфликтует со статусом «В работе» головы); статус = ярлык.
  // Отправку (целиком/частями) делает отдельный роут /api/orders/[id]/send.
  produceAccept: {
    roles: [...ADMIN, 'branch'],
    patch: () => ({ status: 'Принял', prodPhase: 'accepted' }),
    history: () => 'Принял в работу',
  },
  produceStart: {
    roles: [...ADMIN, 'branch'],
    patch: () => ({ status: 'В работе', prodPhase: 'working' }),
    history: () => 'В работе',
  },
  produceReady: {
    roles: [...ADMIN, 'branch'],
    patch: () => ({ status: 'Готов к доставке', prodPhase: 'ready' }),
    history: () => 'Готов к доставке',
  },
  finalizePurchase: {
    roles: ADMIN,
    guard: c => (c.positions.length && c.positions.every(p => p.respUserId && p.supplierId) ? null : 'У всех позиций закупа должен быть логист и поставщик'),
    patch: () => ({ isDraft: false, screen: 'outgoing', block: '', status: 'В работе' }),
    history: () => 'Закуп оформлен → в работу',
  },
  cancel: {
    roles: ADMIN,
    patch: c => ({ isCancelled: true, cancelReason: c.payload.reason || '', status: 'Отменён' }),
    history: c => `Отменён${c.payload.reason ? ': ' + c.payload.reason : ''}`,
  },
  restore: {
    roles: ADMIN,
    patch: () => ({ isCancelled: false, cancelReason: '', status: 'Восстановлен' }),
    history: () => 'Восстановлен',
  },
}

export async function dispatchAction(id: string, action: string, actor: Session | null | undefined, payload: Record<string, any>) {
  // «Провести» из «К учёту» (мост): напрямую проводим накладную → карточка в Бухгалтерию.
  if (action === 'invoice') {
    const { postOrderInvoice } = await import('./invoice.service')
    try { const { releaseCard } = await import('./reserve.service'); await releaseCard(id) } catch {}
    const r = await postOrderInvoice(id, actor)
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
  }
  const def = TRANSITIONS[action]
  if (!def) return { ok: false as const, error: 'Неизвестное действие' }

  const [order] = await repo.getOrder(id)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  if (def.roles && actor && !def.roles.includes(actor.role)) return { ok: false as const, error: 'Недостаточно прав' }

  const positions = await repo.positionsByCard(id)
  const ctx: Ctx = { order, positions, actor, payload: payload || {} }
  const g = def.guard?.(ctx)
  if (g) return { ok: false as const, error: g }

  await repo.updateOrder(id, def.patch(ctx))

  // Эффект process/logistAccept: продажа уходит в работу → резервируем товар на Центр-Складе.
  if ((action === 'process' || action === 'logistAccept') && order.kind === 'sale') {
    try { const { reserveForCard } = await import('./reserve.service'); await reserveForCard(order.orgId, id, positions) } catch {}
  }
  // Снятие резерва: карточка ушла в учёт (реальный расход) или отменена.
  if (action === 'sendAcc' || action === 'cancel') {
    try { const { releaseCard } = await import('./reserve.service'); await releaseCard(id) } catch {}
  }
  // Массовая доставка: все позиции → «Доставлено», резерв снят, документ проводится сразу (1С).
  if (action === 'markAll') {
    await repo.updatePositionsByCard(id, { status: 'Доставлено' })
    try { const { releaseCard } = await import('./reserve.service'); await releaseCard(id) } catch {}
    if (!order.linkedDocId) { try { const { postOrderInvoice } = await import('./invoice.service'); await postOrderInvoice(id, actor) } catch {} }
  }
  // Возврат из Исходящих: сброс позиций (кроме плеча филиала).
  if (action === 'returnOut' || action === 'returnToReception') {
    await repo.resetPositionsForReturn(id)
  }
  // Филиал передал логисту: позиции первого плеча (leg=1) → leg=2, теперь их видит логист.
  if (action === 'branchForward') await repo.setLegForCard(id, 1, 2)
  // «Готов к доставке» = изделия фактически изготовлены → авто-документ производства:
  // +изделия на склад филиала, −доля листа по ширине (одна проводка, как «Производство» в 1С).
  // Идемпотентно: повторный клик по уже проведённой карточке ничего не выпускает.
  if (action === 'produceReady') {
    try {
      const { alreadyProduced, produceToBase } = await import('./producer.service')
      if (!(await alreadyProduced(id))) await produceToBase(id, actor)
    } catch { /* производство не должно ронять смену этапа */ }
  }
  // Закуп оформлен → открыть связанные продажи: перенести поставщика/цену/логиста,
  // продажи становятся готовыми на столе Приёмки (openLinkedSales, как в Улкане).
  if (action === 'finalizePurchase') {
    try { const { openLinkedSales } = await import('./procurement.service'); await openLinkedSales(order.orgId, id) } catch {}
  }

  // Эффект take: автоподстановка поставщик/логист по группе товара (CategoryRule).
  if (action === 'take') {
    const meta = await repo.productMeta(positions.filter(p => p.productId).map(p => p.productId))
    const metaMap = new Map(meta.map((m: any) => [m.id, { group: m.group || '', cat: m.cat || '' }]))
    const patches = await applyDefaults(order.orgId, positions, metaMap)
    for (const patch of patches) {
      const { id: pid, ...set } = patch
      await repo.updatePosition(pid, set)
    }
  }

  await repo.insertHistory({ cardId: id, action, detail: def.history(ctx), userName: actor?.name || 'Система' })
  return { ok: true as const }
}
