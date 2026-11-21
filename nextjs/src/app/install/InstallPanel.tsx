'use client'
// Экран «Установить U-Kan»: кнопка установки (Android/Chrome) и честная инструкция для тех
// браузеров, где системной установки нет — встроенный браузер WhatsApp/Telegram, Safari,
// старый Chrome. Страница публичная: вход спросят уже внутри кабинета.
import { useEffect, useState } from 'react'

export default function InstallPanel({ slug }: { slug: string }) {
  const [evt, setEvt] = useState<any>(null)
  const [state, setState] = useState<'idle' | 'ok' | 'standalone'>('idle')
  const [ua, setUa] = useState({ ios: false, inapp: false, chrome: false })
  const target = slug ? `/rsp/${slug}` : '/'

  useEffect(() => {
    const s = navigator.userAgent
    setUa({
      ios: /iphone|ipad|ipod/i.test(s),
      // встроенный браузер мессенджера/соцсети — установки там не бывает
      inapp: /(FBAN|FBAV|Instagram|WhatsApp|Telegram|Line\/|MiuiBrowser|wv\))/i.test(s),
      chrome: /Chrome\/\d+/i.test(s) && !/EdgA|OPR|SamsungBrowser|YaBrowser/i.test(s),
    })
    if (window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone) setState('standalone')
    const h = (e: any) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', h)
    window.addEventListener('appinstalled', () => setState('ok'))
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  async function install() {
    if (!evt) return
    evt.prompt()
    try { const r = await evt.userChoice; if (r?.outcome === 'accepted') setState('ok') } catch { /* отказ */ }
    setEvt(null)
  }

  const link = typeof window !== 'undefined' ? window.location.origin + target : target

  return (
    <div className="ip">
      <style>{CSS}</style>
      <div className="card">
        <div className="logo">U</div>
        <h1>U-Kan{slug ? ' · Логист' : ''}</h1>
        <p className="sub">{slug ? 'Доска логиста: заказы по поставщикам, остаток склада, смена.' : 'U2B ERP — заявки, склад, финансы.'}</p>

        {state === 'standalone' && <div className="ok">✓ Приложение уже установлено — открой его значок на экране.</div>}
        {state === 'ok' && <div className="ok">✓ Готово! Значок U-Kan появился на главном экране.</div>}

        {state === 'idle' && evt && <button className="go" onClick={install}>📲 Установить приложение</button>}

        {state === 'idle' && !evt && (
          <div className="how">
            {ua.inapp ? (
              <>
                <b>Ссылка открыта во встроенном браузере</b> (WhatsApp / Telegram) — установки там нет.
                Нажми «⋮» вверху и выбери <b>«Открыть в Chrome»</b> (или скопируй адрес и вставь в Chrome),
                потом вернись на эту страницу.
              </>
            ) : ua.ios ? (
              <>
                <b>iPhone / iPad:</b> внизу Safari нажми <b>«Поделиться»</b> → пролистай до{' '}
                <b>«На экран „Домой"»</b> → «Добавить».
              </>
            ) : ua.chrome ? (
              <>
                <b>Chrome:</b> меню <b>«⋮»</b> справа вверху → <b>«Установить приложение»</b> или{' '}
                <b>«Добавить на главный экран»</b>. Если пункта нет — обнови страницу один раз и загляни снова.
              </>
            ) : (
              <>
                В этом браузере установки может не быть. Открой адрес в <b>Google Chrome</b> —
                там меню «⋮» → «Установить приложение».
              </>
            )}
          </div>
        )}

        <a className="open" href={target}>Открыть в браузере →</a>
        <div className="url" onClick={() => navigator.clipboard?.writeText(link).catch(() => {})} title="нажми — скопировать">
          {link}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.ip{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#0079bf;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.ip .card{background:#fff;border-radius:18px;padding:26px 22px;max-width:420px;width:100%;box-shadow:0 18px 50px -20px rgba(9,30,66,.6);text-align:center}
.ip .logo{width:60px;height:60px;border-radius:16px;background:#0079bf;color:#fff;font-size:30px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
.ip h1{margin:0 0 6px;font-size:21px;color:#172b4d}
.ip .sub{margin:0 0 18px;font-size:13.5px;color:#6b778c;line-height:1.5}
.ip .go{width:100%;border:none;background:#0079bf;color:#fff;border-radius:10px;padding:14px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit}
.ip .ok{background:#e3fcef;color:#006644;border-radius:10px;padding:12px;font-size:13.5px;font-weight:700;margin-bottom:12px}
.ip .how{background:#f4f5f7;border-radius:10px;padding:13px;font-size:13.5px;color:#42526e;line-height:1.6;text-align:left}
.ip .open{display:block;margin-top:14px;color:#0079bf;font-size:14px;font-weight:700;text-decoration:none}
.ip .url{margin-top:10px;font-size:11.5px;color:#8993a4;word-break:break-all;cursor:pointer}
`
