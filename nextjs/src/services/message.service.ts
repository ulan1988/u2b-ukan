import * as repo from '../repositories/message.repo'
import type { Session } from '../lib/auth'

export const listMessages = (cardId: string) => repo.byCard(cardId)

export async function sendMessage(cardId: string, text: string, actor: Session) {
  const t = (text || '').trim()
  if (!t) return { ok: false as const, error: 'Пустое сообщение' }
  const [m] = await repo.insert({ cardId, userId: actor.id, userName: actor.name, role: actor.role, text: t.slice(0, 2000) })
  // Уведомить админов организации о новом сообщении.
  try {
    const { notifyAdmins } = await import('./notifyHelpers')
    await notifyAdmins(actor.orgId, `💬 ${actor.name}: ${t.slice(0, 60)}`, cardId, actor.id)
  } catch { /* уведомления не критичны */ }
  return { ok: true as const, message: m }
}
