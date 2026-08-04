'use client'
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { isPurchase, fmtMoney } from '@/lib/adminFmt'
import { setPosStatus, logout } from '@/lib/adminApi'

const STEPS = ['В работе', 'В пути', 'Доставлено']
const STEP_STYLE: Record<string, { bg: string; color: string }> = {
  'В работе': { bg: '#fff0ea', color: '#c0532a' }, 'В пути': { bg: '#fdf8e1', color: '#8a6f00' }, 'Доставлено': { bg: '#e8f5ee', color: '#2e8a5e' },
}

export default function LogistPortal({ user }: { user: { name: string } }) {
  const [orders, setOrders] = useState<any[]>([])
  const [tab, setTab] = useState<'active' | 'done'>('active')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/logist/orders').then(r => r.json()).then(o => setOrders(Array.isArray(o) ? o : [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function setPos(cardId: string, posId: string, status: string) { await setPosStatus(cardId, status, posId); load() }

  const isDone = (o: any) => (o.positions || []).length > 0 && o.positions.every((p: any) => p.status === 'Доставлено')
  const list = orders.filter(o => (tab === 'done' ? isDone(o) : !isDone(o)))

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {/* Шапка */}
      <div style={{ background: COLORS.dark, color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="U2B" style={{ width: 38, height: 38, borderRadius: 9 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Логист</div>
          <div style={{ fontSize: 12, color: COLORS.sidebar.muted }}>{user.name}</div>
        </div>
        <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: COLORS.sidebar.badge, border: 'none', color: COLORS.sidebar.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Выйти</button>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', background: '#fff', borderRadius: 10, padding: 4, marginBottom: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          {([['active', 'Активные'], ['done', 'Выполнено']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: tab === k ? COLORS.primary : 'transparent', color: tab === k ? '#fff' : COLORS.textMuted }}>{l}</button>
          ))}
        </div>

        {loading ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, fontSize: 14 }}>{tab === 'done' ? 'Пока ничего не выполнено' : 'Нет активных доставок'}</div>
            : list.map(o => (
              <div key={o.id} style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{o.id}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isPurchase(o) ? '#f3eeff' : '#e8f5ee', color: isPurchase(o) ? '#7a3aaa' : '#2e8a5e' }}>{isPurchase(o) ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: COLORS.textMuted }}>{o.fromName}</span>
                </div>
                {(o.positions || []).map((p: any) => (
                  <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid #f6f3f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>{p.name1c || p.oral}</span>
                      <span style={{ fontSize: 13, color: COLORS.textLight }}>{Number(p.qty)} {p.unit} · {fmtMoney(Number(p.qty) * Number(p.price))} ₸</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {STEPS.map(s => {
                        const active = p.status === s; const st = STEP_STYLE[s]
                        return <button key={s} onClick={() => setPos(o.id, p.id, s)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: active ? st.bg : '#f4f1ed', color: active ? st.color : '#9a938a', boxShadow: active ? `inset 0 0 0 1.5px ${st.color}44` : 'none' }}>{s}</button>
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
      </div>
    </div>
  )
}
