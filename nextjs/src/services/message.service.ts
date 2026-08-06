import * as repo from '../repositories/message.repo'
import type { Session } from '../lib/auth'

export const listMessages = (cardId: string) => repo.byCard(cardId)

// Сводка тредов для глобального чат-виджета: по каждой карточке организации,
// где есть сообщения — маршрут, счётчик, последнее сообщение. Свежие первыми.
export async function threads(orgId: string) {
  const rows = await repo.messagesForOrg(orgId)
  if (!rows.length) return []
  const cags = await (await import('../repositories/refs.repo')).listContragents()
  const cagName: Record<string, string> = {}
  for (const c of cags as any[]) cagName[c.id] = c.name
  const byCard = new Map<string, any>()
  for (const m of rows) {
    const e = byCard.get(m.cardId)
    if (e) e.count++
    else byCard.set(m.cardId, {
      cardId: m.cardId, from: m.fromName || '—',
      to: m.kind === 'purchase' ? 'Центр-Склад' : (m.contactId ? (cagName[m.contactId] || '') : ''),
      count: 1, lastText: m.text, lastAuthor: m.userName, lastRole: m.role, lastAt: m.createdAt,
    })
  }
  return Array.from(byCard.values()).sort((a, b) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime())
}

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
