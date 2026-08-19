'use client'
// Кабинет листов производителя (публичный /listy/[slug]) — дизайн владельца 1:1:
// тёмный фон, истинные 3D-изометрические стопки (rotateX58/rotateZ−38 + слои-листы),
// палитра RAL с именами (6 базовых + 8 через «глаз»), bottom-sheet с клавиатурой и ±.
// Вход по ИМЕНИ (без пароля) + журнал «кто вносил» (аудит).
import { useState, useEffect, useCallback } from 'react'

const RALS: Record<string, [string, string]> = {
  '9003': ['#F4F6F2', 'сигнальный белый'], '7024': ['#45494E', 'графитовый серый'],
  '7004': ['#9EA0A1', 'сигнальный серый'], '8017': ['#442F29', 'шоколадно-коричневый'],
  '1015': ['#E6D690', 'светлая слоновая кость'], '2004': ['#E75B12', 'чистый оранжевый'],
  '1018': ['#F8D338', 'цинково-жёлтый'], '8019': ['#3D3635', 'серо-коричневый'],
  '6005': ['#0F4336', 'зелёный мох'], '6007': ['#26392F', 'бутылочно-зелёный'],
  '3005': ['#5E2028', 'винно-красный'], '3020': ['#C1121C', 'транспортный красный'],
  '5005': ['#154889', 'сигнальный синий'],
  'wood': ['repeating-linear-gradient(112deg,#7a5844 0 5px,#674939 5px 9px,#8a6650 9px 13px)', 'текстура'],
}
const BASE = ['9003', '7024', '7004', '8017', '1015', '2004']
const EXTRA = ['1018', '8019', '6005', '6007', '3005', '3020', '5005', 'wood']
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const SANS = "Barlow, 'Golos Text', system-ui, sans-serif"
const ourColor = (ral: string) => (ral === 'wood' ? 'дерево' : ral)

function lum(hex: string) {
  if (!hex || hex[0] !== '#') return 0.32
  const h = hex.slice(1)
  const n = h.length === 3 ? h.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255
}
// Слои 3D-стопки (порт из дизайна): count → массив листов с translate3d по Z.
function layersFor(count: number, hex: string, dark: boolean) {
  const edge = dark ? 'rgba(255,255,255,.30)' : 'rgba(0,0,0,.42)'
  const maxH = 82, per = 0.34
  const h = Math.min(maxH, count * per)
  const n = Math.max(count > 0 ? 1 : 0, Math.min(count, 34))
  const step = n > 1 ? h / (n - 1) : 0
  const out: React.CSSProperties[] = []
  for (let i = 0; i < n; i++) {
    const z = i * step
    const jx = ((i * 37) % 7 - 3) * 0.22, jy = ((i * 53) % 5 - 2) * 0.22
    const top = i === n - 1
    out.push({
      position: 'absolute', left: 0, top: 0, width: 48, height: 76, margin: '-38px 0 0 -24px', borderRadius: 1.5,
      background: hex,
      boxShadow: `0 0 0 .6px ${edge}` + (top ? ',0 0 22px rgba(0,0,0,.35)' : ''),
      transform: `translate3d(${jx.toFixed(2)}px,${jy.toFixed(2)}px,${z.toFixed(2)}px)`,
      filter: top ? (dark ? 'brightness(1.5)' : 'brightness(1.06)')
        : `brightness(${(dark ? (0.8 + 0.55 * (i % 2) + 0.25 * (i / Math.max(1, n))) : (0.86 + 0.12 * (i % 2) + 0.08 * (i / Math.max(1, n)))).toFixed(3)})`,
    })
  }
  return out
}

export default function SheetCabinetPublic({ slug }: { slug: string }) {
  const [name, setName] = useState(''); const [nameInput, setNameInput] = useState('')
  const [cab, setCab] = useState<{ name: string; sheets: any[]; log: any[] } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [input, setInput] = useState(''); const [showExtra, setShowExtra] = useState(false)
  const [toast, setToast] = useState('')
  const showMsg = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  useEffect(() => {
    const s = localStorage.getItem('listy_name_' + slug); if (s) setName(s)
    if (!document.getElementById('listy-fonts')) {
      const l = document.createElement('link'); l.id = 'listy-fonts'; l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap'
      document.head.appendChild(l)
    }
  }, [slug])
  const load = useCallback(async () => { try { const r = await fetch(`/api/listy/${slug}/data`); if (r.ok) setCab(await r.json()) } catch {} }, [slug])
  useEffect(() => { load() }, [load])
  const countOf = (ral: string) => { const s = cab?.sheets.find((x: any) => (x.color || '') === ourColor(ral)); return s ? Number(s.glyan) || 0 : 0 }

  async function apply(sign: '+' | '-') {
    const v = parseInt(input, 10) || 0
    if (!openId || v <= 0) return
    try {
      const r = await fetch(`/api/listy/${slug}/take`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ color: ourColor(openId), qty: v, sign, name }) })
      const b = await r.json()
      if (r.ok) { showMsg(`${sign === '-' ? '−' : '+'}${v} листов ${openId}${b.shortfall ? ` (не хватило ${b.shortfall})` : ''}`); setOpenId(null); setInput(''); await load() }
      else showMsg('⚠ ' + (b.error || 'Не удалось'))
    } catch { showMsg('⚠ Ошибка сети') }
  }

  // ── Вход по имени ──
  if (!name) {
    const go = () => { if (nameInput.trim()) { localStorage.setItem('listy_name_' + slug, nameInput.trim()); setName(nameInput.trim()) } }
    return (
      <div style={{ minHeight: '100vh', background: '#111312', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: SANS }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#1b1e1c', borderRadius: 18, padding: 26, boxShadow: '0 10px 40px rgba(0,0,0,.5)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#eceae5' }}>Склад листов</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: '#8b8d88', margin: '4px 0 22px' }}>{cab?.name || ''} · вход по имени</div>
          <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="ваше имя"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '2px solid #2a2e2b', background: '#111312', color: '#fff', fontSize: 18, fontWeight: 600, outline: 'none', marginBottom: 16, fontFamily: SANS }} />
          <button onClick={go} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: nameInput.trim() ? '#e25303' : '#2a2e2b', color: '#fff', fontSize: 16, fontWeight: 700, cursor: nameInput.trim() ? 'pointer' : 'not-allowed', fontFamily: SANS }}>Войти →</button>
          <div style={{ fontSize: 11, color: '#6b6e69', marginTop: 12, lineHeight: 1.4 }}>Имя нужно, чтобы в истории было видно, кто вносил.</div>
        </div>
      </div>
    )
  }

  const list = BASE.concat(showExtra ? EXTRA : [])
  const total = BASE.concat(EXTRA).reduce((a, r) => a + countOf(r), 0)
  const st = openId ? { ral: openId, count: countOf(openId), hex: RALS[openId]?.[0], name: RALS[openId]?.[1] } : null
  const preview = st ? Math.max(0, st.count - (parseInt(input, 10) || 0)) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#111312', display: 'flex', justifyContent: 'center', fontFamily: SANS, color: '#eceae5' }}>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#fff', color: '#111312', padding: '12px 24px', borderRadius: 12, fontSize: 15, fontWeight: 700, zIndex: 99, boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>{toast}</div>}
      <div style={{ width: '100%', maxWidth: 430, minHeight: '100vh', background: 'linear-gradient(#171a19,#111312 220px)', position: 'relative', padding: '0 14px 40px' }}>

        {/* Шапка */}
        <div style={{ padding: '26px 2px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ font: `600 21px/1.1 ${SANS}`, letterSpacing: '.01em' }}>Склад листов</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#8b8d88', marginTop: 5 }}>125 × 200 см · {name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: '#eceae5', lineHeight: 1 }}>{total}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#8b8d88', letterSpacing: '.08em', textTransform: 'uppercase' }}>всего листов</div>
          </div>
        </div>

        {/* Стопки */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {list.map(ral => {
            const [hex, nm] = RALS[ral]; const count = countOf(ral)
            const light = lum(hex) < 0.34
            const card = light ? { bg: '#e9e7e0', border: '#cfccc3', fg: '#1b1e1c', mut: '#6b6e69' } : { bg: '#1d201e', border: '#2a2e2b', fg: '#eceae5', mut: '#7c7e79' }
            const countColor = count === 0 ? (light ? '#a3401c' : '#8b3a1a') : (count <= 20 ? '#e25303' : card.fg)
            const layers = layersFor(count, hex, !light)
            return (
              <div key={ral} onClick={() => { setOpenId(ral); setInput('') }}
                style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: 12, padding: '10px 8px 9px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ height: 120, width: '100%', position: 'relative', perspective: 520 }}>
                  <div style={{ position: 'absolute', left: '50%', bottom: 42, width: 0, height: 0, transformStyle: 'preserve-3d', transform: 'rotateX(58deg) rotateZ(-38deg)' }}>
                    {layers.map((s, i) => <div key={i} style={s} />)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: hex, boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.45)' }} />
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: card.fg }}>{ral === 'wood' ? 'дерево' : ral}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: countColor, lineHeight: 1.25 }}>{count}</div>
                <div style={{ fontSize: 9, color: card.mut, letterSpacing: '.04em', textAlign: 'center', height: 22, overflow: 'hidden' }}>{nm}</div>
              </div>
            )
          })}
        </div>

        {/* Показать остальные */}
        <div onClick={() => setShowExtra(v => !v)} style={{ marginTop: 12, height: 46, borderRadius: 12, background: '#1d201e', border: '1px solid #2a2e2b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', color: '#c9c7c1' }}>
          <span style={{ width: 22, height: 22, borderRadius: 11, background: '#eceae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#1d201e' }} /></span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{showExtra ? 'скрыть' : 'остальные цвета'}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#7c7e79' }}>{EXTRA.length}</span>
        </div>

        <div style={{ marginTop: 22, padding: '12px 14px', background: '#1a1d1b', border: '1px solid #262a27', borderRadius: 10, fontSize: 11, lineHeight: 1.5, color: '#7c7e79' }}>
          Нажмите на стопку и впишите, сколько листов взяли. Высота стопки меняется вместе с остатком. Каждый ввод пишется в историю — видно, кто внёс.
        </div>

        {/* История — кто вносил */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: '#8b8d88', letterSpacing: '.06em', margin: '0 0 8px' }}>ИСТОРИЯ — КТО ВНОСИЛ</div>
          <div style={{ background: '#1a1d1b', border: '1px solid #262a27', borderRadius: 10, overflow: 'hidden' }}>
            {!cab?.log?.length ? <div style={{ padding: 14, color: '#6b6e69', fontSize: 12 }}>Пока пусто.</div>
              : cab.log.map((l: any) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderTop: '1px solid #232725', fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: RALS[l.color === 'дерево' ? 'wood' : l.color]?.[0] || '#888' }} />
                  <span style={{ fontWeight: 700 }}>{l.userName}</span>
                  <span style={{ fontFamily: MONO, color: Number(l.qty) < 0 ? '#e2705a' : '#7bd88f', fontWeight: 700 }}>{Number(l.qty) > 0 ? '+' : ''}{l.qty} {l.color}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: '#6b6e69' }}>{l.createdAt ? new Date(l.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Сменить имя */}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={() => { localStorage.removeItem('listy_name_' + slug); setName('') }} style={{ background: 'none', border: 'none', color: '#5a5d5c', fontSize: 12, cursor: 'pointer', fontFamily: SANS }}>сменить имя ({name})</button>
        </div>
      </div>

      {/* Модалка ± */}
      {st && (
        <div onClick={() => setOpenId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.62)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 40 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: '#1b1e1c', borderTop: '1px solid #2e332f', borderRadius: '20px 20px 0 0', padding: '16px 16px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ width: 44, height: 44, borderRadius: 8, background: st.hex }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{st.ral === 'wood' ? 'Дерево' : 'RAL ' + st.ral}</div>
                <div style={{ fontSize: 12, color: '#8b8d88' }}>{st.name} · было {st.count} · станет {preview}</div>
              </div>
              <button onClick={() => setOpenId(null)} style={{ background: '#2a2e2b', border: 'none', color: '#c9c7c1', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ background: '#111312', border: '2px solid #2a2e2b', borderRadius: 12, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 32, fontWeight: 700, color: input ? '#fff' : '#4a4d4c', marginBottom: 12 }}>{input || '0'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map(k => (
                <button key={k} onClick={() => setInput(s => k === '⌫' ? s.slice(0, -1) : (s + k).replace(/^0+(?=\d)/, '').slice(0, 5))}
                  style={{ height: 54, borderRadius: 12, border: 'none', background: '#2a2e2b', color: '#fff', fontFamily: MONO, fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>{k}</button>
              ))}
            </div>
            <button onClick={() => apply('-')} disabled={!(parseInt(input, 10) > 0)} style={{ width: '100%', height: 58, borderRadius: 14, border: 'none', background: parseInt(input, 10) > 0 ? '#e25303' : '#2a2e2b', color: '#fff', fontSize: 18, fontWeight: 800, cursor: parseInt(input, 10) > 0 ? 'pointer' : 'not-allowed', fontFamily: SANS }}>− Списать</button>
          </div>
        </div>
      )}
    </div>
  )
}
