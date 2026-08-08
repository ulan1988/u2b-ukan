import * as repo from '../repositories/notification.repo'

export const listForUser = (userId: string) => repo.byUser(userId)
export const markRead = (id: string, userId: string) => repo.markRead(id, userId)

// Создать уведомление одному/нескольким пользователям (+ Web Push в шторку со звуком).
export async function notify(userIds: string[], text: string, cardId?: string) {
  if (!userIds.length) return
  await repo.insertMany(userIds.map(userId => ({ userId, text, cardId: cardId ?? null })))
  // Пуш в шторку телефона — фоном, не блокируем и не роняем основную операцию.
  try {
    const { sendPushToUsers } = await import('../lib/webPush')
    await Promise.all(userIds.map(async userId => {
      const count = await repo.unreadCount(userId)
      await sendPushToUsers([userId], { title: 'U2B ERP', body: text, cardId, count })
    }))
  } catch { /* пуш не критичен */ }
}
