'use client'
// Живое обновление (из Улкана). Pusher опционален — при отсутствии ключей
// работает как поллинг. Тут: поллинг-страховка + visibilitychange/online.
import { useEffect, useRef } from 'react'

// Интервал: 10с когда вкладка активна, пауза когда скрыта. При наличии
// NEXT_PUBLIC_PUSHER_KEY можно подключить WS — здесь безопасный поллинг.
export function useLiveData(load: () => void, deps: any[] = [], intervalMs = 12000) {
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    loadRef.current()
    let timer: any = null
    const tick = () => { if (document.visibilityState === 'visible') loadRef.current() }
    timer = setInterval(tick, intervalMs)
    const onVis = () => { if (document.visibilityState === 'visible') loadRef.current() }
    const onOnline = () => loadRef.current()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline) }
  }, deps) // eslint-disable-line
}
