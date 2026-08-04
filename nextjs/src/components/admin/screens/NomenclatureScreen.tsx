'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { listProducts } from '@/lib/api/refs'

// Номенклатура Улкана усилена ERP-справочником товаров. Полное управление
// (правка/архив) — на странице /catalog (общий справочник блока 2).
export default function NomenclatureScreen() {
  const [products, setProducts] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listProducts().then(setProducts).finally(() => setLoading(false))
  }, [])

  const list = q.trim() ? products.filter(p => `${p.name} ${p.group}`.toLowerCase().includes(q.toLowerCase())) : products

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Номенклатура</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск товара" style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none', width: 220 }} />
        <a href="/catalog" style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Управление (правка/архив) →</a>
      </div>

      {loading ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>
        : (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>ТОВАРЫ ({list.length})</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Наименование', 'Группа', 'Ед.', 'Приход', 'Розница', 'Опт'].map((h, i) => <th key={h} style={{ textAlign: i < 3 ? 'left' : 'right', padding: '8px 16px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {list.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #f1efec' }}>
                      <td style={{ padding: '8px 16px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '8px 16px', color: COLORS.textMuted }}>{p.group || '—'}</td>
                      <td style={{ padding: '8px 16px', color: COLORS.textMuted }}>{p.unit}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtMoney(Number(p.priceIn))}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtMoney(Number(p.priceRetail))}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtMoney(Number(p.priceOpt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  )
}
