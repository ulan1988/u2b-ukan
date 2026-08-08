// Service worker для установки PWA (offline-first не нужен — приложение online).
// Наличие SW + manifest даёт кнопку «Установить». Кеш НЕ держим и при активации
// сносим любой старый кеш (от прежних версий) — чтобы клиент всегда получал свежий код.
const SW_VERSION = 'u2b-2026-08-08'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))) } catch {}
  await self.clients.claim()
})()))
// Сетевой passthrough (нужен для установки PWA); ничего не кешируем.
self.addEventListener('fetch', () => { /* сеть напрямую */ })
