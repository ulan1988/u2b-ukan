'use client'
// «Из накладной»: ищем накладную ERP (расходную/приходную) → у найденной кнопка «Создать» → выбираем, что оформить
// (счёт на оплату / накладная З-2 / акт Р-1 / КП) — данные покупателя и позиции подставятся из накладной.
import { useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtDate } from '@/lib/adminFmt'
import { listSales, listPurchases } from '@/lib/api/docs'
import { DOC_TYPES } from '@/components/admin/accDocs/DocCreateModal'

const norm = (v: any) => String(v ?? '').toLowerCase().replace(/ё/g, 'е')
const fmt = (n: any) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸'

export default function InvoicePicker({ orgId, onCreate }: { orgId: string; onCreate: (docId: string, type: string) => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let off = false
    Promise.all([listSales(orgId), listPurchases(orgId)]).then(([s, p]) => {
      if (off) return
      setDocs([...(s as any[]).map(d => ({ ...d, kind: 'sale' })), ...(p as any[]).map(d => ({ ...d, kind: 'purchase' }))].filter(d => d.status !== 'cancelled'))
      setLoaded(true)
    })
    return () => { off = true }
  }, [orgId])

  const words = norm(q).split(/\s+/).filter(Boolean)
  const hits = useMemo(() => {
    if (!words.length) return []
    return docs.filter(d => { const h = norm(`${d.number} ${d.contragent || ''} ${d.items || ''} ${Math.round(Number(d.total) || 0)} ${fmtDate(d.date)}`); return words.every(w => h.includes(w)) })
      .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8)
  }, [docs, q]) // eslint-disable-line

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>📎 Из накладной — найдите накладную и создайте для неё документ</div>
      <input value={q} onChange={e => { setQ(e.target.value); setMenu(null) }} placeholder={loaded ? '🔍 Накладная: номер, покупатель, товар, сумма…' : 'Загрузка накладных…'}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', outline: 'none', fontFamily: 'inherit', fontSize: 14, background: '#fff' }} />
      {q.trim() && hits.length === 0 && <div style={{ padding: '12px 4px', color: COLORS.textMuted, fontSize: 14 }}>Накладные не найдены</div>}
      {hits.map(d => (
        <div key={d.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderTop: '1px solid #f4f1ed', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: d.kind === 'sale' ? '#e8f5ee' : '#f3eeff', color: d.kind === 'sale' ? '#2e8a5e' : '#7a3aaa' }}>{d.kind === 'sale' ? 'РАСХОД' : 'ПРИХОД'}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: COLORS.primary }}>{d.number}</span>
          <span style={{ fontSize: 13, color: COLORS.textMuted }}>{fmtDate(d.date)}</span>
          <span style={{ fontWeight: 700, fontSize: 15, flex: '1 1 160px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.contragent || '—'}</span>
          <span style={{ fontSize: 12.5, color: COLORS.textMuted, flex: '2 1 200px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.items || '').split(' | ').slice(0, 2).join(', ')}</span>
          <b style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{fmt(d.total)}</b>
          <button onClick={() => setMenu(menu === d.id ? null : d.id)} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>＋ Создать ▾</button>
          {menu === d.id && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 30, marginTop: 2, background: '#fff', border: '1.5px solid #e6e2dc', borderRadius: 11, boxShadow: '0 8px 28px rgba(0,0,0,.18)', minWidth: 240, overflow: 'hidden' }}>
              {DOC_TYPES.map(t => (
                <div key={t.key} onClick={() => { setMenu(null); onCreate(d.id, t.key) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid #f4f1ed' }}>
                  <span style={{ fontSize: 20 }}>{t.icon}</span>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div><div style={{ fontSize: 12, color: COLORS.textMuted }}>{t.sub}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
