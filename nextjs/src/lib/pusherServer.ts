import Pusher from 'pusher'

// Серверный Pusher — singleton, ленивая инициализация.
// Без env-ключей возвращает null → pushSignal становится тихим no-op (поллинг-фолбэк).
let server: Pusher | null = null
let inited = false

function getServerPusher(): Pusher | null {
  if (inited) return server
  inited = true
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) { server = null; return null }
  server = new Pusher({ appId: PUSHER_APP_ID, key: PUSHER_KEY, secret: PUSHER_SECRET, cluster: PUSHER_CLUSTER || 'ap2', useTLS: true })
  return server
}

// Сигнал «данные изменились» в канал. Await'им до ответа роута — иначе на serverless
// (Vercel) функция замерзает и не-awaited POST в Pusher теряется. Предохранитель 2.5с.
// Ошибки глушим; без ключей — мгновенный no-op.
export async function pushSignal(channel = 'updates'): Promise<void> {
  const p = getServerPusher()
  if (!p) return
  try {
    await Promise.race([
      p.trigger(channel, 'signal', {}),
      new Promise<void>(resolve => setTimeout(resolve, 2500)),
    ])
  } catch { /* realtime не должен ронять API */ }
}
