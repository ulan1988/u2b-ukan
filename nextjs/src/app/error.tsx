'use client'
import { useEffect } from 'react'

// Падение клиентского роутера (React #310 при переходах между кабинетами) лечится перезагрузкой:
// один раз перезагружаем сами, повторно — показываем кнопку (чтобы не уйти в цикл).
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem('u2b_err_reload') || 0)
      if (Date.now() - last > 15000) {
        sessionStorage.setItem('u2b_err_reload', String(Date.now()))
        location.reload()
      }
    } catch {}
  }, [error])
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>Что-то пошло не так</div>
      <div style={{ fontSize: 14, color: '#5f5952' }}>Страница обновится сама. Если нет — нажмите кнопку.</div>
      <button onClick={() => { try { reset() } catch {} location.reload() }}
        style={{ padding: '12px 22px', minHeight: 44, borderRadius: 10, border: 'none', background: '#d4603a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Обновить</button>
    </div>
  )
}
