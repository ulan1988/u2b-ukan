'use client'
import { useEffect, useState } from 'react'

// Подписка на Web Push (уведомления в шторке телефона со звуком). Если разрешение
// уже дано — подписываемся молча. Если нет — показываем кнопку «Включить уведомления»
// (запрос разрешения требует жеста пользователя).
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

async function doSubscribe() {
  if (!VAPID) return
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID) })
  await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
}

export default function PushSetup() {
  const [perm, setPerm] = useState<string>('unsupported')

  useEffect(() => {
    const okEnv = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID
    if (!okEnv) { setPerm('unsupported'); return }
    setPerm(Notification.permission)
    if (Notification.permission === 'granted') doSubscribe().catch(() => {})
  }, [])

  async function enable() {
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
      if (p === 'granted') await doSubscribe()
    } catch { /* пользователь отказал */ }
  }

  if (perm !== 'default') return null   // 'granted' (подписаны), 'denied' или unsupported — кнопку не показываем
  return (
    <button onClick={enable} style={{ position: 'fixed', left: 14, bottom: 16, zIndex: 120, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 24, border: 'none', background: '#211f1c', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
      🔔 Включить уведомления
    </button>
  )
}
