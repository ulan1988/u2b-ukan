'use client'
// «Накладные» (У-Канбан) — дашборд накладных: приходные + расходные, колонки по статусам,
// переключатель Приход/Расход/Всё, поиск (номер/контрагент), галочка «проверено» вкл/выкл
// прямо на карточке. Клик → форма накладной. (Позже добавим остальные стадии/страницы.)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { listPurchases, listSales, updateDocument } from '@/lib/api/docs'
import InvoiceForm from '@/components/admin/InvoiceForm'

const COLS = [
  { key: 'unrev', label: '⚠ Не проверено', tint: '#fff8e1', test: (d: any) => d.status !== 'cancelled' && !d.reviewed },
  { key: 'rev', label: '✓ Проверено', tint: '#e8f5ee', test: (d: any) => d.status !== 'cancelled' && d.reviewed },
  { key: 'cancelled', label: '❌ Отменён', tint: '#faeaea', test: (d: any) => d.status === 'cancelled' },
]

export default function UkanbanScreen({ orgId, onOpen }: { orders?: any[]; orgId: string; onAction?: (id: string, a: string) => void; onOpen?: (o: any) => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [kind, setKind] = useState<'all' | 'purchase' | 'sale'>('all')
  const [q, setQ] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [openDocId, setOpenDocId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([listPurchases(orgId), listSales(orgId)])
    setDocs([...(p as any[]).map(d => ({ ...d, type: 'purchase' })), ...(s as any[]).map(d => ({ ...d, type: 'sale' }))])
  }, [orgId])
  useEffect(() => { load() }, [load])

  async function toggleReviewed(d: any, checked: boolean) {
    setDocs(prev => prev.map(x => x.id === d.id ? { ...x, reviewed: checked } : x))   // оптимистично
    await updateDocument(d.id, { reviewed: checked })
  }

  const filtered = useMemo(() => {
    let base = docs
    if (kind !== 'all') base = base.filter(d => d.type === kind)
    const s = q.trim().toLowerCase()
    if (s) base = base.filter(d => `${d.number} ${d.contragent || ''} ${d.total} ${fmtDate(d.date)}`.toLowerCase().includes(s))
    return base
  }, [docs, kind, q])

  const cols = COLS.filter(c => c.key !== 'cancelled' || showCancelled).map(c => ({ ...c, items: filtered.filter(c.test) }))

  const kindBtn = (k: 'all' | 'purchase' | 'sale', label: string) => (
    <button onClick={() => setKind(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: kind === k ? COLORS.primary : '#fff', color: kind === k ? '#fff' : COLORS.textMuted, boxShadow: kind === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>🧾 Накладные</div>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>всего: <b style={{ color: COLORS.text }}>{filtered.length}</b></span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>{kindBtn('all', 'Всё')}{kindBtn('purchase', '🛒 Приходные')}{kindBtn('sale', '📄 Расходные')}</div>
        <label style={{ fontSize: 13, color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} /> показать отменённые</label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск: номер, контрагент…"
          style={{ marginLeft: 'auto', minWidth: 260, flex: '1 1 260px', maxWidth: 420, padding: '9px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', fontSize: 14 }} />
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
        {cols.map(c => (
          <div key={c.key} style={{ flexShrink: 0, width: 320, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 180px)' }}>
            <div style={{ padding: '9px 12px', background: '#fff', borderRadius: '12px 12px 0 0', boxShadow: '0 0 0 1.5px #e6e2dc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</span>
              <span style={{ marginLeft: 'auto', background: c.items.length ? COLORS.primary : '#e6e2dc', color: c.items.length ? '#fff' : '#837c72', fontSize: 12, padding: '1px 8px', borderRadius: 20, fontWeight: 700 }}>{c.items.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: c.tint, borderRadius: '0 0 12px 12px', padding: '8px 8px 4px', minHeight: 60 }}>
              {c.items.length === 0 ? <div style={{ color: '#9a938a', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>—</div>
                : c.items.map(d => {
                  const purchase = d.type === 'purchase'
                  return (
                    <div key={d.id} onClick={() => setOpenDocId(d.id)} style={{ background: '#fff', borderRadius: 10, padding: 10, marginBottom: 8, cursor: 'pointer', borderLeft: `4px solid ${purchase ? '#7a3aaa' : '#2e8a5e'}`, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: purchase ? '#7a3aaa' : COLORS.primary }}>{d.number}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: purchase ? '#f3eeff' : '#e8f5ee', color: purchase ? '#7a3aaa' : '#2e8a5e' }}>{purchase ? 'ПРИХОД' : 'РАСХОД'}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#837c72' }}>{fmtDate(d.date)}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{d.contragent || '—'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {d.status !== 'cancelled' && (
                          <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: d.reviewed ? '#2e8a5e' : '#8a6f00', cursor: 'pointer', fontWeight: 600 }}>
                            <input type="checkbox" checked={!!d.reviewed} onChange={e => toggleReviewed(d, e.target.checked)} /> проверено
                          </label>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: COLORS.text }}>{fmtMoney(Number(d.total))} ₸</span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>

      {openDocId && <InvoiceForm id={openDocId} onClose={() => setOpenDocId(null)} onSaved={load} />}
    </div>
  )
}
