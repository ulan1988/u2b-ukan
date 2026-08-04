'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'

// Склад Улкана усилен ERP-остатками (stock_movements → остаток по складу).
export default function WarehouseScreen({ orgId }: { orgId: string }) {
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [products, setProducts] = useState<Record<string, any>>({})
  const [whId, setWhId] = useState('')
  const [stock, setStock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/refs').then(r => r.json()).then(r => {
      const whs = (r.warehouses || []).filter((w: any) => w.orgId === orgId)
      setWarehouses(whs)
      const map: Record<string, any> = {}; for (const p of (r.products || [])) map[p.id] = p
      setProducts(map)
      setWhId(whs.find((w: any) => w.isCentral)?.id || whs[0]?.id || '')
    })
  }, [orgId])

  useEffect(() => {
    if (!whId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/stock?orgId=${orgId}&warehouseId=${whId}`).then(r => r.json())
      .then(s => setStock(Array.isArray(s) ? s : [])).catch(() => setStock([])).finally(() => setLoading(false))
  }, [whId, orgId])

  const rows = stock.map(s => ({ ...s, product: products[s.productId] })).filter(r => Number(r.qty) !== 0)

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Склад</div>
        <select value={whId} onChange={e => setWhId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none' }}>
          {warehouses.map(w => <option key={w.id} value={w.id}>🏬 {w.name}</option>)}
        </select>
      </div>

      {loading ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка остатков…</div>
        : rows.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14 }}>На складе пусто</div>
          : (
            <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Товар', 'Группа', 'Остаток', 'Цена прих.', 'Стоимость'].map((h, i) => <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '8px 16px' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(r => {
                    const qty = Number(r.qty); const priceIn = Number(r.product?.priceIn || 0)
                    return (
                      <tr key={r.productId} style={{ borderTop: '1px solid #f1efec' }}>
                        <td style={{ padding: '8px 16px', fontWeight: 600 }}>{r.product?.name || r.productId}</td>
                        <td style={{ padding: '8px 16px', color: COLORS.textMuted }}>{r.product?.group || '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right' }}>{qty} {r.product?.unit || ''}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', color: COLORS.textMuted }}>{fmtMoney(priceIn)}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(qty * priceIn)} ₸</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
    </div>
  )
}
