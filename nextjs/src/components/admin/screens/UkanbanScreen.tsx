'use client'
// У-Канбан — гипер-универсальный интерфейс. Внутри РЕЖИМЫ (переключаешь один/другой):
// сейчас «Накладные» (канбан приходных+расходных по статусам). Позже — Финанс, Сделки и т.д.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { listPurchases, listSales, updateDocument } from '@/lib/api/docs'
import InvoiceForm from '@/components/admin/InvoiceForm'

const MODES = [
  { key: 'invoices', label: '🧾 Накладные', ready: true },
  { key: 'finance', label: '💰 Финанс', ready: false },
  { key: 'deals', label: '📋 Сделки', ready: false },
]

export default function UkanbanScreen({ orgId, onOpen }: { orders?: any[]; orgId: string; onAction?: (id: string, a: string) => void; onOpen?: (o: any) => void }) {
  const [mode, setMode] = useState('invoices')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>🗂 У-Канбан</div>
        {/* Переключатель режимов — включить один, выключить другой. */}
        <div style={{ display: 'flex', gap: 6 }}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} disabled={!m.ready} title={m.ready ? '' : 'Скоро'}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: m.ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: mode === m.key ? COLORS.primary : '#fff', color: mode === m.key ? '#fff' : (m.ready ? COLORS.textMuted : '#b8b1a6'), boxShadow: mode === m.key ? 'none' : '0 0 0 1.5px #e6e2dc', position: 'relative' }}>
              {m.label}{!m.ready && <span style={{ fontSize: 10, marginLeft: 5, opacity: .8 }}>скоро</span>}
            </button>
          ))}
        </div>
      </div>

      {mode === 'invoices' && <InvoicesMode orgId={orgId} />}
      {mode !== 'invoices' && <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }}>Режим в разработке — добавим на следующем этапе.</div>}
    </div>
  )
}

// Фильтр по дате: диапазон от-до имеет приоритет, иначе пресет сегодня/вчера/месяц.
type DPeriod = 'all' | 'today' | 'yesterday' | 'month'
function matchDate(dateStr: any, period: DPeriod, from: string, to: string): boolean {
  if (!dateStr) return period === 'all' && !from && !to
  const d = new Date(dateStr)
  if (from || to) {
    if (from && d < new Date(from)) return false
    if (to && d > new Date(to + 'T23:59:59')) return false
    return true
  }
  if (period === 'all') return true
  const now = new Date()
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (period === 'today') return same(d, now)
  if (period === 'yesterday') { const y = new Date(now); y.setDate(now.getDate() - 1); return same(d, y) }
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  return true
}

// ─── Режим «Накладные»: канбан приходных+расходных по статусам ─────────────────
const COLS = [
  { key: 'unrev', label: '⚠ Не проверено', tint: '#fff8e1', test: (d: any) => d.status !== 'cancelled' && !d.reviewed },
  { key: 'rev', label: '✓ Проверено', tint: '#e8f5ee', test: (d: any) => d.status !== 'cancelled' && d.reviewed },
  { key: 'cancelled', label: '❌ Отменён', tint: '#faeaea', test: (d: any) => d.status === 'cancelled' },
]

function InvoicesMode({ orgId }: { orgId: string }) {
  const [docs, setDocs] = useState<any[]>([])
  const [kind, setKind] = useState<'all' | 'purchase' | 'sale'>('all')
  const [q, setQ] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [period, setPeriod] = useState<DPeriod>('all')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [openDocId, setOpenDocId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([listPurchases(orgId), listSales(orgId)])
    setDocs([...(p as any[]).map(d => ({ ...d, type: 'purchase' })), ...(s as any[]).map(d => ({ ...d, type: 'sale' }))])
  }, [orgId])
  useEffect(() => { load() }, [load])

  async function toggleReviewed(d: any, checked: boolean) {
    setDocs(prev => prev.map(x => x.id === d.id ? { ...x, reviewed: checked } : x))
    await updateDocument(d.id, { reviewed: checked })
  }

  const filtered = useMemo(() => {
    let base = docs
    if (kind !== 'all') base = base.filter(d => d.type === kind)
    base = base.filter(d => matchDate(d.date, period, from, to))
    const s = q.trim().toLowerCase()
    if (s) base = base.filter(d => `${d.number} ${d.contragent || ''} ${d.items || ''} ${d.total} ${fmtDate(d.date)}`.toLowerCase().includes(s))
    return base
  }, [docs, kind, q, period, from, to])

  const cols = COLS.filter(c => c.key !== 'cancelled' || showCancelled).map(c => ({ ...c, items: filtered.filter(c.test) }))

  const kindBtn = (k: 'all' | 'purchase' | 'sale', label: string) => (
    <button onClick={() => setKind(k)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, background: kind === k ? '#7a3aaa' : '#fff', color: kind === k ? '#fff' : COLORS.textMuted, boxShadow: kind === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>накладных: <b style={{ color: COLORS.text }}>{filtered.length}</b></span>
        <div style={{ display: 'flex', gap: 6 }}>{kindBtn('all', 'Всё')}{kindBtn('purchase', '🛒 Приходные')}{kindBtn('sale', '📄 Расходные')}</div>
        <label style={{ fontSize: 13, color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} /> показать отменённые</label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск: номер, контрагент, товар…"
          style={{ marginLeft: 'auto', minWidth: 240, flex: '1 1 240px', maxWidth: 400, padding: '9px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', fontSize: 14 }} />
      </div>

      {/* Фильтр по датам: пресеты + диапазон от-до */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>📅</span>
        {([['all', 'Всё'], ['today', 'Сегодня'], ['yesterday', 'Вчера'], ['month', 'Месяц']] as [DPeriod, string][]).map(([p, l]) => (
          <button key={p} onClick={() => { setPeriod(p); setFrom(''); setTo('') }} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12.5, fontWeight: (!from && !to && period === p) ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: (!from && !to && period === p) ? COLORS.primary : '#f1efec', color: (!from && !to && period === p) ? '#fff' : '#6b655b' }}>{l}</button>
        ))}
        <span style={{ fontSize: 12.5, color: '#5f5952', marginLeft: 6 }}>от</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${from ? COLORS.primary : '#e6e2dc'}`, fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }} />
        <span style={{ fontSize: 12.5, color: '#5f5952' }}>до</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${to ? COLORS.primary : '#e6e2dc'}`, fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }} />
        {(from || to) && <button onClick={() => { setFrom(''); setTo('') }} title="Сбросить диапазон" style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 16, cursor: 'pointer' }}>×</button>}
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
        {cols.map(c => (
          <div key={c.key} style={{ flexShrink: 0, width: 320, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 210px)' }}>
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
