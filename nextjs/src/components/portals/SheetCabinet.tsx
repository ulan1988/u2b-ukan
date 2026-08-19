'use client'
// Кабинет листов (отдельный, для рабочих). Визуально — 3D-стопки листов по цветам:
// толщина стопки ∝ количеству (≈200 норма, до 400). Тап по стопке → цифровая
// клавиатура «сколько взял» → списывается, стопка уменьшается. Индикатор целых листов.
import { useState, useEffect, useCallback } from 'react'
import { ralOrdered, RalDot } from '@/lib/ral'
import { sheetsByColor, takeSheet } from '@/lib/api/refs'
import { logout } from '@/lib/api/auth'

const PRIMARY = '#d4613a'
// толщина стопки в px по кол-ву листов (0 → тонкая, 200 → норма, 400 → макс)
const thickPx = (n: number) => 6 + Math.min(Math.max(n, 0), 420) * 0.42

export default function SheetCabinet({ user }: { user: { name: string; orgId: string } }) {
  const [sheets, setSheets] = useState<any[]>([])
  const [active, setActive] = useState<any>(null)   // выбранный цвет {code,...}
  const [pad, setPad] = useState('')
  const [toast, setToast] = useState('')
  const showMsg = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => { setSheets(await sheetsByColor(user.orgId)) }, [user.orgId])
  useEffect(() => { load() }, [load])
  const qtyOf = (code: string) => { const s = sheets.find((x: any) => (x.color || '') === code); return s ? Number(s.glyan) || 0 : 0 }
  const matOf = (code: string) => { const s = sheets.find((x: any) => (x.color || '') === code); return s ? Number(s.mat) || 0 : 0 }

  async function submit() {
    const n = Number(pad) || 0
    if (!active || n <= 0) return
    const r: any = await takeSheet(active.code, n)
    if (r.ok) { showMsg(`− ${n} листов ${active.code}${r.shortfall ? ` (не хватило ${r.shortfall})` : ''}`); setActive(null); setPad(''); await load() }
    else showMsg('⚠ ' + (r.error || 'Не удалось'))
  }

  const colors = ralOrdered(false)   // избранные цвета

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#fff', color: '#0f172a', padding: '12px 24px', borderRadius: 12, fontSize: 15, fontWeight: 700, zIndex: 9999, boxShadow: '0 8px 30px rgba(0,0,0,.4)' }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, background: '#0f172a', zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8', letterSpacing: '.5px' }}>📄 СКЛАД ЛИСТОВ</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{user.name} · целые листы по цветам</div>
        </div>
        <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', fontSize: 13, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Выйти</button>
      </div>

      {/* Полки со стопками */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 16, padding: '22px 16px 40px', maxWidth: 860, margin: '0 auto' }}>
        {colors.map((c: any) => {
          const n = qtyOf(c.code); const mat = matOf(c.code); const h = thickPx(n)
          return (
            <button key={c.code} type="button" onClick={() => { setActive(c); setPad('') }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '8px 4px', minHeight: 210 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: n > 0 ? '#f8fafc' : '#475569', lineHeight: 1 }}>{n}</div>
              {/* 3D-стопка */}
              <div style={{ perspective: 420, width: 82, display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: 82, height: h, borderRadius: 4,
                  background: c.bg || c.hex,
                  backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 3px, rgba(0,0,0,.17) 3px, rgba(0,0,0,.17) 4px)',
                  boxShadow: `4px 5px 0 rgba(0,0,0,.35), inset 0 3px 4px rgba(255,255,255,.45), inset 0 -3px 5px rgba(0,0,0,.25)`,
                  transform: 'rotateX(10deg)', transformOrigin: 'bottom', transition: 'height .45s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <RalDot code={c.code} size={12} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
              </div>
              {mat > 0 && <span style={{ fontSize: 10, color: '#64748b' }}>мат {mat}</span>}
            </button>
          )
        })}
      </div>

      {/* Клавиатура ввода */}
      {active && (
        <div onClick={() => setActive(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#1e293b', borderRadius: '20px 20px 0 0', padding: 20, boxShadow: '0 -8px 40px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: active.bg || active.hex, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.2)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{active.code === 'decor' ? 'дерево' : active.code}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>в наличии {qtyOf(active.code)} листов</div>
              </div>
              <button onClick={() => setActive(null)} style={{ background: '#334155', border: 'none', color: '#cbd5e1', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ background: '#0f172a', border: '2px solid #334155', borderRadius: 12, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800, color: pad ? '#f8fafc' : '#475569', marginBottom: 14 }}>{pad || 'сколько взял'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map(k => {
                const isOk = k === '✓', isDel = k === '⌫'
                return (
                  <button key={k} onClick={() => { if (isOk) submit(); else if (isDel) setPad(p => p.slice(0, -1)); else setPad(p => (p + k).replace(/^0+(?=\d)/, '').slice(0, 4)) }}
                    style={{ height: 62, borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 24, fontWeight: 800, fontFamily: 'inherit', background: isOk ? PRIMARY : isDel ? '#475569' : '#334155', color: '#fff' }}>{k}</button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
