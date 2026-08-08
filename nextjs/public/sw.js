// Service worker для установки PWA (offline-first не нужен — приложение online).
// Наличие SW + manifest даёт кнопку «Установить». Кеш НЕ держим и при активации
// сносим любой старый кеш (от прежних версий) — чтобы клиент всегда получал свежий код.
const SW_VERSION = 'u2b-2026-08-08-push'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))) } catch {}
  await self.clients.claim()
})()))
// Сетевой passthrough (нужен для установки PWA); ничего не кешируем.
self.addEventListener('fetch', () => { /* сеть напрямую */ })

// Web Push: уведомление в шторку (со звуком/вибро на Android) + цифра на иконке.
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (_) {}
  const title = d.title || 'U2B ERP'
  const options = {
    body: d.body || 'Новое уведомление',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [80, 40, 80],
    tag: d.cardId || 'u2b',
    renotify: true,
    data: { url: d.url || '/' },
  }
  e.waitUntil((async () => {
    await self.registration.showNotification(title, options)
    try {
      if (typeof d.count === 'number' && self.navigator && self.navigator.setAppBadge) {
        if (d.count > 0) await self.navigator.setAppBadge(d.count)
        else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge()
      }
    } catch (_) {}
  })())
})

// Клик по уведомлению — открыть/сфокусировать приложение.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) { if ('focus' in c) { try { await c.navigate(url) } catch (_) {} return c.focus() } }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
