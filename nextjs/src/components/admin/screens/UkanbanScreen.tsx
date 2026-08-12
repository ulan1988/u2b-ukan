'use client'
// У-Канбан — гипер-универсальный интерфейс. Внутри РЕЖИМЫ (переключаешь один/другой):
// сейчас «Накладные» (канбан приходных+расходных по статусам). Позже — Финанс, Сделки и т.д.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { listPurchases, listSales, listReturns, updateDocument } from '@/lib/api/docs'
import { listContragents, reconcile } from '@/lib/api/refs'
import ContragentPicker from '@/components/ContragentPicker'
import InvoiceForm from '@/components/admin/InvoiceForm'
import RouteModal from '@/components/admin/RouteModal'

const MODES = [
  { key: 'invoices', label: '🧾 Накладные', ready: true },
  { key: 'reconcile', label: '📄 Акт сверки', ready: true },
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
      {mode === 'reconcile' && <ReconcileMode />}
      {mode !== 'invoices' && mode !== 'reconcile' && <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }}>Режим в разработке — добавим на следующем этапе.</div>}
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
  const [kind, setKind] = useState<'all' | 'purchase' | 'sale' | 'return'>('all')
  const [q, setQ] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [period, setPeriod] = useState<DPeriod>('all')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  const [routeDocId, setRouteDocId] = useState<string | null>(null)
  const [links, setLinks] = useState(false)   // тумблер «Связки»: клик → граф пути

  const load = useCallback(async () => {
    const [p, s, r] = await Promise.all([listPurchases(orgId), listSales(orgId), listReturns(orgId)])
    setDocs([...(p as any[]), ...(s as any[]), ...(r as any[])])   // у каждого свой type (purchase/sale/return_in/return_out)
  }, [orgId])
  useEffect(() => { load() }, [load])

  async function toggleReviewed(d: any, checked: boolean) {
    setDocs(prev => prev.map(x => x.id === d.id ? { ...x, reviewed: checked } : x))
    await updateDocument(d.id, { reviewed: checked })
  }

  const filtered = useMemo(() => {
    let base = docs
    if (kind === 'purchase') base = base.filter(d => d.type === 'purchase')
    else if (kind === 'sale') base = base.filter(d => d.type === 'sale')
    else if (kind === 'return') base = base.filter(d => d.type === 'return_in' || d.type === 'return_out')
    base = base.filter(d => matchDate(d.date, period, from, to))
    const s = q.trim().toLowerCase()
    if (s) base = base.filter(d => `${d.number} ${d.contragent || ''} ${d.items || ''} ${d.total} ${fmtDate(d.date)}`.toLowerCase().includes(s))
    return base
  }, [docs, kind, q, period, from, to])

  const cols = COLS.filter(c => c.key !== 'cancelled' || showCancelled).map(c => ({ ...c, items: filtered.filter(c.test) }))

  const kindBtn = (k: 'all' | 'purchase' | 'sale' | 'return', label: string) => (
    <button onClick={() => setKind(k)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, background: kind === k ? '#7a3aaa' : '#fff', color: kind === k ? '#fff' : COLORS.textMuted, boxShadow: kind === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>накладных: <b style={{ color: COLORS.text }}>{filtered.length}</b></span>
        <div style={{ display: 'flex', gap: 6 }}>{kindBtn('all', 'Всё')}{kindBtn('purchase', '🛒 Приходные')}{kindBtn('sale', '📄 Расходные')}{kindBtn('return', '↩ Возвраты')}</div>
        <button onClick={() => setLinks(v => !v)} title="Клик по накладной покажет её путь (граф)" style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, background: links ? '#7a3aaa' : '#fff', color: links ? '#fff' : COLORS.textMuted, boxShadow: links ? 'none' : '0 0 0 1.5px #e6e2dc' }}>🔗 Связки {links ? 'вкл' : 'выкл'}</button>
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
                  const isReturn = d.type === 'return_in' || d.type === 'return_out'
                  const purchase = d.type === 'purchase'
                  const accent = isReturn ? '#b4574c' : purchase ? '#7a3aaa' : '#2e8a5e'
                  const badge = isReturn ? (d.type === 'return_in' ? '↩ ВОЗВРАТ от клиента' : '↩ ВОЗВРАТ поставщику') : purchase ? 'ПРИХОД' : 'РАСХОД'
                  return (
                    <div key={d.id} onClick={() => links ? setRouteDocId(d.id) : setOpenDocId(d.id)} style={{ background: '#fff', borderRadius: 10, padding: 10, marginBottom: 8, cursor: 'pointer', borderLeft: `4px solid ${links ? '#7a3aaa' : accent}`, boxShadow: links ? '0 0 0 1.5px #e3d4f0' : '0 1px 4px rgba(0,0,0,.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: accent }}>{d.number}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: isReturn ? '#f7ebe9' : purchase ? '#f3eeff' : '#e8f5ee', color: accent }}>{badge}</span>
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
      {routeDocId && <RouteModal docId={routeDocId} onClose={() => setRouteDocId(null)} />}
    </div>
  )
}

// ─── Режим «Акт сверки»: ведомость взаиморасчётов по контрагенту с нарастающим сальдо ───
const thL: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700 }
const thR: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700 }
const tdL: React.CSSProperties = { textAlign: 'left', padding: '7px 10px' }
const tdR: React.CSSProperties = { textAlign: 'right', padding: '7px 10px', whiteSpace: 'nowrap' }
const emptyBox: React.CSSProperties = { padding: 40, textAlign: 'center', color: COLORS.textMuted, background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }
const dInp = (v: string): React.CSSProperties => ({ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${v ? COLORS.primary : '#e6e2dc'}`, fontSize: 12.5, fontFamily: 'inherit', outline: 'none' })

function ReconcileMode() {
  const [cags, setCags] = useState<any[]>([])
  const [cid, setCid] = useState('')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { listContragents(true).then(r => setCags((r as any[]).filter(c => !c.archived))) }, [])   // без архивных дублей
  useEffect(() => {
    if (!cid) { setData(null); return }
    setLoading(true)
    reconcile(cid, from || undefined, to || undefined).then(d => setData(d)).finally(() => setLoading(false))
  }, [cid, from, to])

  const cag = cags.find(c => c.id === cid)
  const num = (n: any) => Number(n || 0) ? fmtMoney(Number(n)) : ''

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>Контрагент:</span>
        <ContragentPicker contragents={cags} value={cid} onPick={(c: any) => setCid(c.id)} style={{ minWidth: 260 }} />
        <span style={{ fontSize: 12.5, color: '#5f5952', marginLeft: 6 }}>📅 от</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInp(from)} />
        <span style={{ fontSize: 12.5, color: '#5f5952' }}>до</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dInp(to)} />
        {(from || to) && <button onClick={() => { setFrom(''); setTo('') }} title="Сбросить" style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 16, cursor: 'pointer' }}>×</button>}
      </div>

      {!cid ? <div style={emptyBox}>Выберите контрагента — появится акт сверки со всеми движениями и нарастающим сальдо.</div>
        : loading ? <div style={emptyBox}>Загрузка…</div>
          : !data ? <div style={emptyBox}>Нет данных</div>
            : (
              <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
                    <thead>
                      <tr style={{ background: '#faf8f6', color: COLORS.textMuted, fontSize: 11 }}>
                        <th style={thL}>Дата</th><th style={thL}>Документ движения</th>
                        <th style={thR}>Начальный остаток</th><th style={thR}>Увеличение долга</th><th style={thR}>Уменьшение долга</th><th style={thR}>Конечный остаток</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderTop: '2px solid #eee', fontWeight: 800, background: '#fbf7ff' }}>
                        <td style={tdL} colSpan={2}>{cag?.name || 'Контрагент'} · ИТОГО</td>
                        <td style={tdR}>{num(data.totals.opening)}</td><td style={tdR}>{num(data.totals.inc)}</td><td style={tdR}>{num(data.totals.dec)}</td><td style={{ ...tdR, color: COLORS.primary }}>{fmtMoney(Number(data.totals.closing))}</td>
                      </tr>
                      {data.rows.length === 0 ? <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9a938a' }}>Движений в периоде нет</td></tr>
                        : data.rows.map((r: any, i: number) => (
                          <tr key={i} style={{ borderTop: '1px solid #f1efec' }}>
                            <td style={tdL}>{fmtDate(r.date)}</td>
                            <td style={tdL}>{r.title}</td>
                            <td style={tdR}>{num(r.opening)}</td>
                            <td style={{ ...tdR, color: r.inc ? '#2e8a5e' : '#ccc' }}>{num(r.inc)}</td>
                            <td style={{ ...tdR, color: r.dec ? '#b4574c' : '#ccc' }}>{num(r.dec)}</td>
                            <td style={{ ...tdR, fontWeight: 700 }}>{fmtMoney(Number(r.balance))}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', gap: 16, borderTop: '1.5px solid #eee', fontSize: 13, flexWrap: 'wrap' }}>
                  <span>Конечный остаток: <b style={{ color: data.totals.closing >= 0 ? '#b4574c' : '#2e8a5e' }}>{fmtMoney(Math.abs(Number(data.totals.closing)))} ₸</b> {data.totals.closing >= 0 ? '(нам должны)' : '(мы должны)'}</span>
                </div>
              </div>
            )}
    </div>
  )
}
