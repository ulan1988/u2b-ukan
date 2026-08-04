'use client'
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { statusStyle, cardSum, isPurchase, fmtMoney, fmtDate } from '@/lib/adminFmt'
import { logout } from '@/lib/adminApi'

const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none', width: '100%' }

export default function BranchPortal({ user }: { user: { name: string; orgId: string } }) {
  const [tab, setTab] = useState<'incoming' | 'outgoing' | 'new'>('incoming')
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([{ productId: '', qty: '1' }])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/orders?orgId=${user.orgId}`).then(r => r.json()).then(o => setOrders(Array.isArray(o) ? o : [])).catch(() => {})
  }, [user.orgId])
  useEffect(() => { load(); fetch('/api/products').then(r => r.json()).then(p => setProducts(Array.isArray(p) ? p : [])).catch(() => {}) }, [load])

  const setRow = (i: number, patch: any) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  async function submit() {
    setBusy(true)
    const positions = rows.filter(r => r.productId).map(r => {
      const p = products.find(x => x.id === r.productId)
      return { productId: r.productId, name1c: p?.name || '', oral: p?.name || '', qty: Number(r.qty) || 0, unit: p?.unit || 'шт', price: Number(p?.priceRetail) || 0 }
    })
    const res = await fetch('/api/client/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment, positions }) })
    setBusy(false)
    if (res.ok) { setRows([{ productId: '', qty: '1' }]); setComment(''); setTab('incoming'); load() }
  }

  const list = tab === 'incoming' ? orders.filter(o => o.screen === 'incoming' && !o.isCancelled)
    : tab === 'outgoing' ? orders.filter(o => o.screen === 'outgoing' && !o.isCancelled) : []

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      <div style={{ background: COLORS.dark, color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="U2B" style={{ width: 38, height: 38, borderRadius: 9 }} />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15 }}>Филиал</div><div style={{ fontSize: 12, color: COLORS.sidebar.muted }}>{user.name}</div></div>
        <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: COLORS.sidebar.badge, border: 'none', color: COLORS.sidebar.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Выйти</button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {([['incoming', 'Входящие'], ['outgoing', 'Исходящие'], ['new', '＋ Новая заявка']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : COLORS.textMuted, boxShadow: tab === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
          ))}
        </div>

        {tab === 'new' ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 12 }}>ПОЗИЦИИ</div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 34px', gap: 8, marginBottom: 8 }}>
                <select style={inp} value={r.productId} onChange={e => setRow(i, { productId: e.target.value })}><option value="">— товар —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <input style={inp} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} />
                <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b0a99f', fontSize: 18 }}>×</button>
              </div>
            ))}
            <button onClick={() => setRows(rs => [...rs, { productId: '', qty: '1' }])} style={{ background: 'none', border: 'none', color: COLORS.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>＋ позиция</button>
            <textarea style={{ ...inp, minHeight: 56, resize: 'vertical', marginBottom: 12 }} placeholder="Комментарий" value={comment} onChange={e => setComment(e.target.value)} />
            <button disabled={busy} onClick={submit} style={{ padding: '11px 22px', background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.5 : 1 }}>{busy ? 'Отправка…' : 'Отправить'}</button>
          </div>
        ) : list.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14 }}>Пусто</div>
          : list.map(o => (
            <div key={o.id} style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>{o.id}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isPurchase(o) ? '#f3eeff' : '#e8f5ee', color: isPurchase(o) ? '#7a3aaa' : '#2e8a5e' }}>{isPurchase(o) ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
                <span style={statusStyle(o.status)}>{o.status}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: COLORS.textMuted }}>{fmtDate(o.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 6 }}>{(o.positions || []).map((p: any) => `${p.name1c || p.oral} ×${Number(p.qty)}`).join(', ')}</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(cardSum(o))} ₸</div>
            </div>
          ))}
      </div>
    </div>
  )
}
