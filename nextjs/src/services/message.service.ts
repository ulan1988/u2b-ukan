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
  // Получатель закупа — заказчик связанной заявки (Центр-Склад только посредник).
  const orderRepo = await import('../repositories/order.repo')
  const purchaseIds = Array.from(new Set(rows.filter((m: any) => m.kind === 'purchase').map((m: any) => m.cardId)))
  const recByCard: Record<string, string[]> = {}
  for (const r of await orderRepo.recipientsByPurchases(purchaseIds as string[])) {
    const nm = String((r as any).name || '').trim()
    if (!nm) continue
    const bag = (recByCard[(r as any).cardId] ||= [])
    if (!bag.includes(nm)) bag.push(nm)
  }
  const toOf = (m: any) => {
    if (m.kind !== 'purchase') return m.contactId ? (cagName[m.contactId] || '') : ''
    const rec = recByCard[m.cardId] || []
    return rec.length ? (rec.length > 1 ? `${rec[0]} +${rec.length - 1}` : rec[0]) : 'Центр-Склад'
  }
  const byCard = new Map<string, any>()
  for (const m of rows) {
    const e = byCard.get(m.cardId)
    if (e) e.count++
    else byCard.set(m.cardId, {
      cardId: m.cardId, from: m.fromName || '—',
      to: toOf(m),
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
