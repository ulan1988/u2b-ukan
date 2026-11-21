'use client'
// «📲 Установить U-Kan» — кабинет логиста ставится на главный экран телефона как приложение.
// Android/Chrome: ловим beforeinstallprompt и показываем свою кнопку (системный баннер
// Chrome показывает редко). iPhone: системного запроса нет вовсе — рисуем короткую подсказку
// «Поделиться → На экран „Домой"». Уже установлено (display-mode: standalone) — молчим.
import { useEffect, useState } from 'react'

const KEY = 'u2b_install_hidden'

export default function InstallApp({ compact }: { compact?: boolean }) {
  const [evt, setEvt] = useState<any>(null)
  const [ios, setIos] = useState(false)
  const [hidden, setHidden] = useState(true)
  const [how, setHow] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
      || (navigator as any).standalone === true
    let off = false
    try { off = localStorage.getItem(KEY) === '1' } catch { /* приватный режим */ }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIos(isIos)
    setHidden(standalone || off)
    const h = (e: any) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  // Нечего предлагать: уже установлено, скрыто пользователем, или браузер не умеет (и не iOS).
  if (hidden || (!evt && !ios)) return null

  const close = () => { setHidden(true); try { localStorage.setItem(KEY, '1') } catch { /* ничего */ } }
  async function install() {
    if (!evt) { setHow(true); return }
    evt.prompt()
    try { const r = await evt.userChoice; if (r?.outcome === 'accepted') close() } catch { /* отказ */ }
    setEvt(null)
  }

  if (compact) return (
    <button className="inst-mini" onClick={install}>📲 Установить U-Kan</button>
  )

  return (
    <div className="inst">
      <style>{CSS}</style>
      <span className="t">📲 Поставь U-Kan на главный экран — открывается как приложение</span>
      <button className="go" onClick={install}>Установить</button>
      <button className="x" onClick={close} title="Скрыть">✕</button>
      {how && (
        <div className="how" onClick={() => setHow(false)}>
          На iPhone: нажми <b>«Поделиться»</b> внизу Safari → <b>«На экран „Домой"»</b> → «Добавить».
        </div>
      )}
    </div>
  )
}

const CSS = `
.inst{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(255,255,255,.18);border-radius:10px;padding:8px 10px;margin:0 12px 10px;color:#fff;font-size:12.5px}
.inst .t{flex:1 1 220px}
.inst .go{border:none;background:#fff;color:#026aa7;border-radius:7px;padding:6px 12px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit}
.inst .x{border:none;background:none;color:#fff;opacity:.8;cursor:pointer;font-size:13px}
.inst .how{flex:1 1 100%;background:rgba(0,0,0,.25);border-radius:8px;padding:8px 10px;line-height:1.45;cursor:pointer}
.inst-mini{border:none;background:none;color:var(--text);text-align:left;padding:9px 11px;border-radius:7px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;display:block;width:100%}
.inst-mini:hover{background:var(--surface2)}
`
