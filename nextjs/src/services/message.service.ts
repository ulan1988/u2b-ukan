import * as repo from '../repositories/message.repo'
import type { Session } from '../lib/auth'

export const listMessages = (cardId: string) => repo.byCard(cardId)

export async function sendMessage(cardId: string, text: string, actor: Session) {
  const t = (text || '').trim()
  if (!t) return { ok: false as const, error: 'Пустое сообщение' }
  const [m] = await repo.insert({ cardId, userId: actor.id, userName: actor.name, role: actor.role, text: t.slice(0, 2000) })
  return { ok: true as const, message: m }
}
