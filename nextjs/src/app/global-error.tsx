'use client'
import { useEffect } from 'react'

// Ошибка в самом корне (роутер/layout): страницы нет вообще — перезагружаем один раз.
export default function GlobalError({ error }: { error: Error }) {
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
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: '#f1efec' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Что-то пошло не так</div>
          <div style={{ fontSize: 14, color: '#5f5952' }}>Страница обновится сама. Если нет — нажмите кнопку.</div>
          <button onClick={() => location.reload()}
            style={{ padding: '12px 22px', minHeight: 44, borderRadius: 10, border: 'none', background: '#d4603a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Обновить</button>
        </div>
      </body>
    </html>
  )
}
