'use client'
// Отдельный кабинет листов производителя (публичный по ссылке /listy/[slug]).
// Вход по ИМЕНИ (без пароля) → каждый ввод пишется в журнал (видно кто внёс).
// Дизайн: тёмный фон, скошенные 3D-стопки по цветам (толщина ∝ кол-ву), оранжевый акцент.
import { useState, useEffect, useCallback } from 'react'
import { ralOrdered, RalDot } from '@/lib/ral'

const ORANGE = '#E75B12', BG = '#111312', CARD = '#1b1e1d'
const thickPx = (n: number) => 6 + Math.min(Math.max(n, 0), 420) * 0.42
const fmtT = (d: any) => d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

export default function SheetCabinetPublic({ slug }: { slug: string }) {
  const [name, setName] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [cab, setCab] = useState<{ name: string; sheets: any[]; log: any[] } | null>(null)
  const [active, setActive] = useState<any>(null)
  const [pad, setPad] = useState('')
  const [toast, setToast] = useState('')
  const showMsg = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  useEffect(() => { const s = localStorage.getItem('listy_name_' + slug); if (s) setName(s) }, [slug])
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/listy/${slug}/data`); if (r.ok) setCab(await r.json()) } catch {}
  }, [slug])
  useEffect(() => { load() }, [load])

  const qtyOf = (code: string) => { const s = cab?.sheets.find((x: any) => (x.color || '') === code); return s ? Number(s.glyan) || 0 : 0 }
  const matOf = (code: string) => { const s = cab?.sheets.find((x: any) => (x.color || '') === code); return s ? Number(s.mat) || 0 : 0 }

  async function submit() {
    const n = Number(pad) || 0
    if (!active || n <= 0) return
    try {
      const r = await fetch(`/api/listy/${slug}/take`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ color: active.code, qty: n, name }) })
      const b = await r.json()
      if (r.ok) { showMsg(`− ${n} листов ${active.code}${b.shortfall ? ` (не хватило ${b.shortfall})` : ''}`); setActive(null); setPad(''); await load() }
      else showMsg('⚠ ' + (b.error || 'Не удалось'))
    } catch { showMsg('⚠ Ошибка сети') }
  }

  // ── Экран входа по имени ──
  if (!name) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'Golos Text', system-ui, sans-serif" }}>
        <div style={{ width: '100%', maxWidth: 360, background: CARD, borderRadius: 18, padding: 26, boxShadow: '0 10px 40px rgba(0,0,0,.5)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: ORANGE, marginBottom: 6 }}>📄 Склад листов</div>
          <div style={{ fontSize: 13, color: '#8a8d90', marginBottom: 20 }}>{cab?.name || 'Производитель'} · вход по имени</div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#8a8d90', display: 'block', marginBottom: 6 }}>ВАШЕ ИМЯ</label>
          <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && nameInput.trim() && (localStorage.setItem('listy_name_' + slug, nameInput.trim()), setName(nameInput.trim()))}
            placeholder="напр. Асхат" style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '2px solid #333', background: '#0d0f0e', color: '#fff', fontSize: 18, fontWeight: 600, outline: 'none', marginBottom: 16 }} />
          <button onClick={() => { if (nameInput.trim()) { localStorage.setItem('listy_name_' + slug, nameInput.trim()); setName(nameInput.trim()) } }}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: nameInput.trim() ? ORANGE : '#333', color: '#fff', fontSize: 16, fontWeight: 800, cursor: nameInput.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Войти →</button>
          <div style={{ fontSize: 11, color: '#5a5d5c', marginTop: 12, lineHeight: 1.4 }}>Имя нужно, чтобы в истории было видно, кто вносил данные.</div>
        </div>
      </div>
    )
  }

  const colors = ralOrdered(false)
  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#f0f0f0', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#fff', color: BG, padding: '12px 24px', borderRadius: 12, fontSize: 15, fontWeight: 700, zIndex: 9999, boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #2a2e2c', position: 'sticky', top: 0, background: BG, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: ORANGE }}>📄 СКЛАД ЛИСТОВ</div>
          <div style={{ fontSize: 12, color: '#8a8d90' }}>{cab?.name || ''} · вы: <b style={{ color: '#cfd2d0' }}>{name}</b></div>
        </div>
        <button onClick={() => { localStorage.removeItem('listy_name_' + slug); setName('') }} style={{ background: 'none', border: '1px solid #333', color: '#8a8d90', fontSize: 13, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Сменить имя</button>
      </div>

      {/* Стопки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 18, padding: '26px 16px 30px', maxWidth: 900, margin: '0 auto' }}>
        {colors.map((c: any) => {
          const n = qtyOf(c.code); const mat = matOf(c.code); const h = thickPx(n)
          return (
            <button key={c.code} type="button" onClick={() => { setActive(c); setPad('') }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 10, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 4px', minHeight: 230 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: n > 0 ? '#fff' : '#4a4d4c', lineHeight: 1 }}>{n}</div>
              <div style={{ perspective: 500, width: 88, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                <div style={{
                  width: 84, height: h, borderRadius: 3,
                  background: c.bg || c.hex,
                  backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 3px, rgba(0,0,0,.2) 3px, rgba(0,0,0,.2) 4px)',
                  border: '1.5px solid rgba(255,255,255,.22)',
                  boxShadow: `6px 7px 0 rgba(0,0,0,.45), inset 0 3px 5px rgba(255,255,255,.5), inset 0 -4px 6px rgba(0,0,0,.3)`,
                  transform: 'skewY(-9deg)', transformOrigin: 'bottom', transition: 'height .5s cubic-bezier(.34,1.2,.5,1)',
                }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <RalDot code={c.code} size={12} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#cfd2d0' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
              </div>
              {mat > 0 && <span style={{ fontSize: 10, color: '#6a6d6c' }}>мат {mat}</span>}
            </button>
          )
        })}
      </div>

      {/* Журнал (кто вносил) */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 40px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#8a8d90', letterSpacing: '.06em', margin: '6px 0 10px' }}>🕓 ИСТОРИЯ — КТО ВНОСИЛ</div>
        <div style={{ background: CARD, borderRadius: 12, overflow: 'hidden' }}>
          {!cab?.log?.length ? <div style={{ padding: 16, color: '#6a6d6c', fontSize: 13 }}>Пока пусто.</div>
            : cab.log.map((l: any) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid #232725' }}>
                <RalDot code={l.color} size={13} />
                <span style={{ fontWeight: 700, color: '#f0f0f0', fontSize: 14 }}>{l.userName}</span>
                <span style={{ color: '#e2705a', fontWeight: 700 }}>− {l.qty} {l.color}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6a6d6c' }}>{fmtT(l.createdAt)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Клавиатура */}
      {active && (
        <div onClick={() => setActive(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: CARD, borderRadius: '20px 20px 0 0', padding: 20, boxShadow: '0 -8px 40px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: active.bg || active.hex, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.2)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{active.code === 'decor' ? 'дерево' : active.code}</div>
                <div style={{ fontSize: 12, color: '#8a8d90' }}>в наличии {qtyOf(active.code)} листов · вносит {name}</div>
              </div>
              <button onClick={() => setActive(null)} style={{ background: '#2a2e2c', border: 'none', color: '#cfd2d0', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ background: '#0d0f0e', border: '2px solid #333', borderRadius: 12, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800, color: pad ? '#fff' : '#4a4d4c', marginBottom: 14 }}>{pad || 'сколько взял'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map(k => {
                const isOk = k === '✓', isDel = k === '⌫'
                return <button key={k} onClick={() => { if (isOk) submit(); else if (isDel) setPad(p => p.slice(0, -1)); else setPad(p => (p + k).replace(/^0+(?=\d)/, '').slice(0, 4)) }}
                  style={{ height: 62, borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 24, fontWeight: 800, fontFamily: 'inherit', background: isOk ? ORANGE : isDel ? '#3a3e3c' : '#2a2e2c', color: '#fff' }}>{k}</button>
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
