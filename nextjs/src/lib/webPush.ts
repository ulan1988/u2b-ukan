// Отправка Web Push уведомлений (шторка телефона + звук). Работает только если
// заданы VAPID-ключи в env (иначе no-op). Мёртвые подписки (404/410) чистим.
import webpush from 'web-push'
import * as subRepo from '../repositories/pushSub.repo'

let configured = false
// Публичный ключ вшит фолбэком (не секретный); приватный — ТОЛЬКО из env (секрет).
const PUB_FALLBACK = 'BDc7pDdtoq8fXHAgZt5ptV1R3wc6SZDWp5LejgTPkD7BCbERe0jO9p6QVJFQZnBKz75hqHynqb1TqiqcBLMN_l8'
function ensure(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || PUB_FALLBACK
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false   // без приватного ключа (env Vercel) отправка невозможна
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ul19.88ibon2009@gmail.com', pub, priv)
    configured = true
  }
  return true
}

export interface PushPayload { title: string; body: string; url?: string; cardId?: string; count?: number }

// Разослать пуш всем подпискам указанных пользователей.
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!ensure() || !userIds.length) return
  const subs = await subRepo.byUsers(Array.from(new Set(userIds)))
  if (!subs.length) return
  const data = JSON.stringify(payload)
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data)
    } catch (e: any) {
      // Подписка протухла (отписались/переустановили) — удаляем.
      if (e?.statusCode === 404 || e?.statusCode === 410) { try { await subRepo.removeByEndpoint(s.endpoint) } catch {} }
    }
  }))
}
