'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { fetchRefs, stock as fetchStock } from '@/lib/api/refs'
import { logout } from '@/lib/api/auth'

export default function WarehousePortal({ user }: { user: { name: string; orgId: string } }) {
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [products, setProducts] = useState<Record<string, any>>({})
  const [whId, setWhId] = useState('')
  const [stock, setStock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRefs().then((r: any) => {
      const whs = (r.warehouses || []).filter((w: any) => w.orgId === user.orgId)
      setWarehouses(whs)
      const map: Record<string, any> = {}; for (const p of (r.products || [])) map[p.id] = p
      setProducts(map)
      setWhId(whs.find((w: any) => w.isCentral)?.id || whs[0]?.id || '')
    })
  }, [user.orgId])

  useEffect(() => {
    if (!whId) { setLoading(false); return }
    setLoading(true)
    fetchStock(user.orgId, whId).then(setStock).finally(() => setLoading(false))
  }, [whId, user.orgId])

  const rows = stock.map(s => ({ ...s, product: products[s.productId] })).filter(r => Number(r.qty) !== 0)
  const totalValue = rows.reduce((sum, r) => sum + Number(r.qty) * Number(r.product?.priceIn || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      <div style={{ background: COLORS.dark, color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="U2B" style={{ width: 38, height: 38, borderRadius: 9 }} />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15 }}>Склад</div><div style={{ fontSize: 12, color: COLORS.sidebar.muted }}>{user.name}</div></div>
        <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: COLORS.sidebar.badge, border: 'none', color: COLORS.sidebar.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Выйти</button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={whId} onChange={e => setWhId(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none' }}>
            {warehouses.map(w => <option key={w.id} value={w.id}>🏬 {w.name}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700 }}>Итого: {fmtMoney(totalValue)} ₸</div>
        </div>

        {loading ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Загрузка остатков…</div>
          : rows.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14 }}>На складе пусто</div>
            : (
              <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Товар', 'Группа', 'Остаток'].map((h, i) => <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '10px 16px' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.productId} style={{ borderTop: '1px solid #f1efec' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{r.product?.name || r.productId}</td>
                        <td style={{ padding: '10px 16px', color: COLORS.textMuted }}>{r.product?.group || '—'}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700 }}>{Number(r.qty)} {r.product?.unit || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  )
}
