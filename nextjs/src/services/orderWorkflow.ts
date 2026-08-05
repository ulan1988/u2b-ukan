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
  sendAcc: {
    roles: ADMIN,
    guard: c => (c.order.toacc ? null : 'Карточка ещё не готова к учёту'),
    patch: () => ({ screen: 'accounting', status: 'К учёту' }),
    history: () => 'Отправлен в учёт',
  },
  postAcc: {
    roles: ADMIN,
    patch: () => ({ screen: 'bookkeeping', status: 'В бухгалтерии', posted1c: true }),
    history: () => 'Проведён в бухгалтерию',
  },
  sendArchive: {
    roles: ADMIN,
    patch: () => ({ screen: 'archive', status: 'Архив' }),
    history: () => 'Отправлен в архив',
  },
  unarchive: {
    roles: ADMIN,
    patch: () => ({ screen: 'bookkeeping', status: 'В бухгалтерии' }),
    history: () => 'Возврат из архива',
  },
  returnToIncoming: {
    roles: ADMIN,
    patch: () => ({ screen: 'incoming', block: '', status: 'В ожидании' }),
    history: () => 'Возврат во Входящие',
  },
  postpone: {
    roles: ADMIN,
    patch: c => ({ postponed: !c.order.postponed }),
    history: c => (c.order.postponed ? 'Снят с отложенных' : 'Отложен'),
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
