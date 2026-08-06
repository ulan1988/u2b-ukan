'use client'
// Живое обновление. Есть NEXT_PUBLIC_PUSHER_KEY → real-time через WebSocket
// (канал 'updates', событие 'signal') + лёгкая страховка. Нет ключа → поллинг.
import { useEffect, useRef } from 'react'

const CHANNEL = 'updates'

// ── Один Pusher-клиент на всё приложение (singleton) ──
let pusherClient: any = null
let pusherInited = false
function getPusherClient(): any {
  if (pusherInited) return pusherClient
  pusherInited = true
  if (typeof window === 'undefined') { pusherClient = null; return null }
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  if (!key) { pusherClient = null; return null }
  try {
    const Pusher = require('pusher-js')
    pusherClient = new Pusher(key, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap2' })
  } catch { pusherClient = null }
  return pusherClient
}

// Подписка на сигнал: возвращает функцию отписки. С Pusher — WS + редкая страховка
// (5 мин пока WS жив, 20с пока не connected). Без Pusher — поллинг intervalMs.
function subscribeSignal(onSignal: () => void, intervalMs: number): () => void {
  const onVisible = () => { if (document.visibilityState === 'visible') onSignal() }
  const onOnline = () => onSignal()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)

  const client = getPusherClient()
  if (!client) {
    const id = setInterval(() => { if (document.visibilityState === 'visible') onSignal() }, intervalMs)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onOnline) }
  }

  const ch = client.subscribe(CHANNEL)
  const handler = () => onSignal()
  ch.bind('signal', handler)

  const conn = client.connection
  const CONNECTED_MS = 5 * 60 * 1000, DOWN_MS = 20 * 1000
  const isConnected = () => conn?.state === 'connected'
  let tick: any = setInterval(onSignal, isConnected() ? CONNECTED_MS : DOWN_MS)
  const schedule = () => { if (tick) clearInterval(tick); tick = setInterval(onSignal, isConnected() ? CONNECTED_MS : DOWN_MS) }
  const onState = (s: any) => {
    const wasConn = s.previous === 'connected', nowConn = s.current === 'connected'
    if (nowConn && !wasConn) onSignal()   // reconnect → догоняющий сигнал
    if (nowConn !== wasConn) schedule()
  }
  conn?.bind('state_change', onState)

  return () => {
    try { ch.unbind('signal', handler) } catch {}
    if (tick) clearInterval(tick)
    try { conn?.unbind('state_change', onState) } catch {}
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    // канал не отписываем — на нём могут быть другие подписчики
  }
}

export function useLiveData(load: () => void, deps: any[] = [], intervalMs = 12000) {
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    loadRef.current()
    const unsub = subscribeSignal(() => loadRef.current(), intervalMs)
    return unsub
  }, deps) // eslint-disable-line
}
