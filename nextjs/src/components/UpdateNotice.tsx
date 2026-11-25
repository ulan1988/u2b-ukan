'use client'
// ВЫШЛО ОБНОВЛЕНИЕ — ПРЕДЛОЖИТЬ ОБНОВИТЬ СТРАНИЦУ (правило 25.11.2026).
// Касса, кабинеты и админка открыты целый день. После выкладки открытая вкладка продолжает работать на СТАРОМ
// коде, пока её не перезагрузят: исправление уже на сервере, а на экране прежняя ошибка (25.11.2026 — форма
// «Взяли в долг» записала одну позицию из нескольких через 4 минуты после выхода исправления).
// Страница знает свою версию (NEXT_PUBLIC_BUILD_SHA зашит при сборке) и раз в минуту — а также при возврате на
// вкладку — спрашивает у сервера свежую. Разошлись — сверху плашка «Вышло обновление», нажал — страница обновилась.
// Сами не перезагружаем: человек может быть посреди ввода (чек кассы при этом не теряется — он в черновике).
import { useEffect, useState } from 'react'
import { liveVersion } from '@/lib/api/version'

const MINE = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev'

export default function UpdateNotice() {
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    if (MINE === 'dev') return   // локальная разработка — версий нет
    let stop = false
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return
      const live = await liveVersion()
      if (!stop && live && live !== 'dev' && live !== MINE) setFresh(true)
    }
    const t = setInterval(check, 60000)
    const onShow = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    check()
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow) }
  }, [])
  if (!fresh) return null
  return (
    <button onClick={() => window.location.reload()} data-update-notice
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 5000, border: 'none', background: '#1f7a4d', color: '#fff', padding: '9px 12px', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,.25)' }}>
      🔄 Вышло обновление программы — нажмите, чтобы обновить
    </button>
  )
}
