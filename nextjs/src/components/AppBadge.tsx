'use client'
import { useEffect } from 'react'

// Бейдж-счётчик на иконке установленного PWA (Badging API) + префикс во вкладке.
// Работает пока приложение открыто/в фоне; данные приходят realtime (Pusher),
// поэтому число новых карточек обновляется само. Замена пуш-уведомлениям на телефоне.
export default function AppBadge({ count, baseTitle = 'U2B ERP' }: { count: number; baseTitle?: string }) {
  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null
    if (nav && typeof nav.setAppBadge === 'function') {
      if (count > 0) nav.setAppBadge(count).catch(() => {})
      else if (typeof nav.clearAppBadge === 'function') nav.clearAppBadge().catch(() => {})
    }
    // Дублируем в заголовок вкладки — видно и на десктопе, где Badging нет.
    if (typeof document !== 'undefined') {
      document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle
    }
  }, [count, baseTitle])
  return null
}
