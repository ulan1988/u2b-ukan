// Минимальный service worker для установки PWA (offline-first не требуется —
// приложение online). Наличие SW + manifest даёт кнопку «Установить».
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { /* сеть напрямую */ })
