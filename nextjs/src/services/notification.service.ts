import * as repo from '../repositories/notification.repo'

export const listForUser = (userId: string) => repo.byUser(userId)
export const markRead = (id: string, userId: string) => repo.markRead(id, userId)

// Создать уведомление одному/нескольким пользователям.
export const notify = (userIds: string[], text: string, cardId?: string) =>
  repo.insertMany(userIds.map(userId => ({ userId, text, cardId: cardId ?? null })))
