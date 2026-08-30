'use client'
// У-Канбан — гипер-универсальный интерфейс. Внутри РЕЖИМЫ (переключаешь один/другой):
// сейчас «Накладные» (канбан приходных+расходных по статусам). Позже — Финанс, Сделки и т.д.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { listPurchases, listSales, listReturns, updateDocument } from '@/lib/api/docs'
import { listContragents, reconcile, financeSummary, listProducts, productMoves } from '@/lib/api/refs'
import ContragentPicker from '@/components/ContragentPicker'
import NomInline from '@/components/NomInline'
import InvoiceForm from '@/components/admin/InvoiceForm'
import RouteModal from '@/components/admin/RouteModal'

const MODES = [
  { key: 'invoices', label: '🧾 Накладные', ready: true },
  { key: 'reconcile', label: '📄 Акт сверки', ready: true },
  { key: 'debts', label: '💸 Долги', ready: true },
  { key: 'moves', label: '📦 Движение товара', ready: true },
  { key: 'finance', label: '💰 Финанс', ready: false },
  { key: 'deals', label: '📋 Сделки', ready: false },
]

export default function UkanbanScreen({ orgId, onOpen }: { orders?: any[]; orgId: string; onAction?: (id: string, a: string) => void; onOpen?: (o: any) => void }) {
  const [mode, setMode] = useState('invoices')
  const [recCid, setRecCid] = useState('')   // предвыбранный контрагент для акта сверки (клик из «Долги»)

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
      {mode === 'debts' && <DebtsMode orgId={orgId} onOpen={cid => { setRecCid(cid); setMode('reconcile') }} />}
      {mode === 'moves' && <StockMode orgId={orgId} />}
      {mode === 'reconcile' && <ReconcileMode initialCid={recCid} />}
      {mode !== 'invoices' && mode !== 'reconcile' && mode !== 'debts' && mode !== 'moves' && <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }}>Режим в разработке — добавим на следующем этапе.</div>}
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

      {openDocId && <InvoiceForm id={openDocId} drawer onClose={() => setOpenDocId(null)} onSaved={load} />}
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

function ReconcileMode({ initialCid = '' }: { initialCid?: string }) {
  const [cags, setCags] = useState<any[]>([])
  const [cid, setCid] = useState(initialCid)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [openDoc, setOpenDoc] = useState<string | null>(null)   // документ в правой панели
  const [refresh, setRefresh] = useState(0)

  useEffect(() => { listContragents(true).then(r => setCags((r as any[]).filter(c => !c.archived))) }, [])   // без архивных дублей
  useEffect(() => { if (initialCid) setCid(initialCid) }, [initialCid])
  useEffect(() => {
    if (!cid) { setData(null); return }
    setLoading(true)
    reconcile(cid, from || undefined, to || undefined).then(d => setData(d)).finally(() => setLoading(false))
  }, [cid, from, to, refresh])

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
              <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', maxWidth: 1040 }}>
                {Number(data.transitAgentDebt) > 0 && (
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1efec', background: '#fff4ea', fontSize: 13, color: '#c2570f', fontWeight: 700 }}>🔀 Сквозной агент{data.transitAgent ? ` · ${data.transitAgent}` : ''}: {fmtMoney(Number(data.transitAgentDebt))} <span style={{ color: '#8a6f00', fontWeight: 500 }}>— справочно (транзит, мимо склада; в акт/финанс НЕ входит)</span></div>
                )}
                {Array.isArray(data.byProject) && data.byProject.length > 0 && (
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1efec', background: '#fbf9ff' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#7a3aaa', letterSpacing: '.04em', marginBottom: 8 }}>📁 ПО ПРОЕКТАМ</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.byProject.map((p: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, background: '#fff', border: '1.5px solid #e6ddf3', borderRadius: 8, padding: '8px 12px', fontSize: 13, flexWrap: 'wrap' }}>
                          <b style={{ flex: 1, minWidth: 130 }}>{p.name}</b>
                          <span style={{ color: '#5f5952' }}>оборот <b style={{ color: '#26231f' }}>{fmtMoney(Number(p.total))}</b></span>
                          <span style={{ color: '#5f5952' }}>оплачено <b style={{ color: '#2e8a5e' }}>{fmtMoney(Number(p.paid))}</b></span>
                          <span style={{ color: Number(p.balance) > 0 ? '#c1121c' : '#2e8a5e', fontWeight: 800 }}>долг {fmtMoney(Number(p.balance))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
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
                          <tr key={i} onClick={() => r.docId && setOpenDoc(r.docId)} title={r.docId ? 'Открыть документ справа' : ''}
                            style={{ borderTop: '1px solid #f1efec', cursor: r.docId ? 'pointer' : 'default', background: openDoc === r.docId ? '#fff8f5' : 'transparent' }}
                            onMouseEnter={e => { if (r.docId) e.currentTarget.style.background = '#faf8f6' }} onMouseLeave={e => { e.currentTarget.style.background = openDoc === r.docId ? '#fff8f5' : 'transparent' }}>
                            <td style={tdL}>{fmtDate(r.date)}</td>
                            <td style={tdL}>{r.docId ? <span style={{ color: COLORS.primary, fontWeight: 600 }}>{r.title} <span style={{ fontSize: 11 }}>›</span></span> : r.title}</td>
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

      {/* Правая выезжающая панель с данными документа (клик по строке-накладной) */}
      {openDoc && <InvoiceForm id={openDoc} drawer onClose={() => setOpenDoc(null)} onSaved={() => setRefresh(x => x + 1)} />}
    </div>
  )
}

// ─── Режим «Долги»: сальдо по контрагентам с выборками Нам должны / Наши долги ───
function DebtsMode({ orgId, onOpen }: { orgId: string; onOpen: (cid: string) => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [side, setSide] = useState<'all' | 'they' | 'we'>('all')
  const [q, setQ] = useState('')

  useEffect(() => { setLoading(true); financeSummary(orgId).then(d => setData(d)).finally(() => setLoading(false)) }, [orgId])

  const rows = useMemo(() => {
    let list = (data?.contragents || []) as any[]
    if (side === 'they') list = list.filter(c => c.theyOwe > 0.001)
    else if (side === 'we') list = list.filter(c => c.weOwe > 0.001)
    const s = q.trim().toLowerCase()
    if (s) list = list.filter(c => (c.name || '').toLowerCase().includes(s))
    const amt = (c: any) => side === 'we' ? c.weOwe : side === 'they' ? c.theyOwe : Math.max(c.theyOwe, c.weOwe)
    return [...list].sort((a, b) => amt(b) - amt(a))
  }, [data, side, q])

  const sideBtn = (k: 'all' | 'they' | 'we', label: string, color: string) => (
    <button onClick={() => setSide(k)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, background: side === k ? color : '#fff', color: side === k ? '#fff' : COLORS.textMuted, boxShadow: side === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{label}</button>
  )

  return (
    <div>
      {/* Итоги + выборки справа */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ background: '#e8f5ee', borderRadius: 10, padding: '8px 14px' }}>
          <div style={{ fontSize: 11, color: '#2e8a5e', fontWeight: 700 }}>НАМ ДОЛЖНЫ (дебиторка)</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#2e8a5e' }}>{fmtMoney(Number(data?.receivable || 0))} ₸</div>
        </div>
        <div style={{ background: '#faeaea', borderRadius: 10, padding: '8px 14px' }}>
          <div style={{ fontSize: 11, color: '#b4574c', fontWeight: 700 }}>НАШИ ДОЛГИ (кредиторка)</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#b4574c' }}>{fmtMoney(Number(data?.payable || 0))} ₸</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {sideBtn('all', 'Всё', '#7a3aaa')}
          {sideBtn('they', '🟢 Нам должны', '#2e8a5e')}
          {sideBtn('we', '🔴 Наши долги', '#b4574c')}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Контрагент…" style={{ minWidth: 180, padding: '7px 12px', borderRadius: 9, border: '1.5px solid #e6e2dc', outline: 'none', fontFamily: 'inherit', fontSize: 13 }} />
        </div>
      </div>

      {loading ? <div style={emptyBox}>Загрузка…</div>
        : rows.length === 0 ? <div style={emptyBox}>{q || side !== 'all' ? 'Ничего не найдено по фильтру.' : 'Долгов нет — взаиморасчёты закрыты.'}</div>
          : (
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: '#faf8f6', color: COLORS.textMuted, fontSize: 11 }}>
                      <th style={thL}>Контрагент</th><th style={thR}>Нам должны</th><th style={thR}>Наши долги</th><th style={thR}>Сальдо</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c: any) => {
                      const net = c.theyOwe - c.weOwe
                      return (
                        <tr key={c.id} onClick={() => onOpen(c.id)} title="Открыть акт сверки" style={{ borderTop: '1px solid #f1efec', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#faf8f6')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                          <td style={tdL}>{c.name}</td>
                          <td style={{ ...tdR, color: c.theyOwe > 0.001 ? '#2e8a5e' : '#ccc', fontWeight: c.theyOwe > 0.001 ? 700 : 400 }}>{c.theyOwe > 0.001 ? fmtMoney(c.theyOwe) : '—'}</td>
                          <td style={{ ...tdR, color: c.weOwe > 0.001 ? '#b4574c' : '#ccc', fontWeight: c.weOwe > 0.001 ? 700 : 400 }}>{c.weOwe > 0.001 ? fmtMoney(c.weOwe) : '—'}</td>
                          <td style={{ ...tdR, fontWeight: 800, color: net >= 0 ? '#2e8a5e' : '#b4574c' }}>{fmtMoney(Math.abs(net))} {net >= 0 ? '↑ нам' : '↓ мы'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1.5px solid #eee', fontSize: 12.5, color: COLORS.textMuted }}>Контрагентов: <b style={{ color: COLORS.text }}>{rows.length}</b> · клик по строке — акт сверки</div>
            </div>
          )}
    </div>
  )
}

// ─── Режим «Движение товара»: приход/расход/возвраты по выбранному товару + остаток ───
function StockMode({ orgId }: { orgId: string }) {
  const [products, setProducts] = useState<any[]>([])
  const [pid, setPid] = useState('')
  const [pname, setPname] = useState('')
  const [moves, setMoves] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<DPeriod>('all')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  useEffect(() => { listProducts().then(p => setProducts(p as any[])) }, [])
  useEffect(() => {
    if (!pid) { setMoves([]); return }
    setLoading(true)
    productMoves(orgId, pid).then(m => setMoves(m as any[])).finally(() => setLoading(false))
  }, [orgId, pid])

  const qf = (n: number) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 })
  // Остаток нарастающим по ВСЕМ движениям, показываем строки только за период.
  const rows = useMemo(() => {
    let bal = 0
    return moves.map(m => { bal += Number(m.signed); return { ...m, balance: bal } })
      .filter(m => matchDate(m.date, period, from, to))
  }, [moves, period, from, to])
  const totalIn = rows.filter(m => m.signed > 0).reduce((s, m) => s + m.signed, 0)
  const totalOut = rows.filter(m => m.signed < 0).reduce((s, m) => s + Math.abs(m.signed), 0)
  const unit = moves[0]?.unit || ''
  const badge = (t: string) => t === 'purchase' ? { txt: 'Приход', c: '#7a3aaa' } : t === 'sale' ? { txt: 'Расход', c: '#2e8a5e' } : t === 'return_in' ? { txt: '↩ от клиента', c: '#b4574c' } : t === 'return_out' ? { txt: '↩ поставщику', c: '#b4574c' } : { txt: t, c: '#837c72' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>Товар:</span>
        <div style={{ minWidth: 280 }}><NomInline products={products} value={pid} name={pname} onPick={(p: any) => { setPid(p.id); setPname(p.name) }} /></div>
        <span style={{ fontSize: 12.5, color: '#5f5952', marginLeft: 6 }}>📅</span>
        {([['all', 'Всё'], ['today', 'Сегодня'], ['yesterday', 'Вчера'], ['month', 'Месяц']] as [DPeriod, string][]).map(([p, l]) => (
          <button key={p} onClick={() => { setPeriod(p); setFrom(''); setTo('') }} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12.5, fontWeight: (!from && !to && period === p) ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: (!from && !to && period === p) ? COLORS.primary : '#f1efec', color: (!from && !to && period === p) ? '#fff' : '#6b655b' }}>{l}</button>
        ))}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInp(from)} />
        <span style={{ fontSize: 12.5, color: '#5f5952' }}>–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dInp(to)} />
        {(from || to) && <button onClick={() => { setFrom(''); setTo('') }} title="Сбросить" style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 16, cursor: 'pointer' }}>×</button>}
      </div>

      {!pid ? <div style={emptyBox}>Выберите товар — увидите все его движения (приход/расход/возвраты) по накладным за период, с остатком.</div>
        : loading ? <div style={emptyBox}>Загрузка…</div>
          : (
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 16, padding: '12px 14px', borderBottom: '1.5px solid #f1efec', flexWrap: 'wrap', fontSize: 13 }}>
                <span>Приход: <b style={{ color: '#2e8a5e' }}>+{qf(totalIn)} {unit}</b></span>
                <span>Расход: <b style={{ color: '#b4574c' }}>−{qf(totalOut)} {unit}</b></span>
                <span>Остаток на конец: <b style={{ color: COLORS.primary }}>{qf(rows.length ? rows[rows.length - 1].balance : 0)} {unit}</b></span>
                <span style={{ marginLeft: 'auto', color: COLORS.textMuted }}>движений: {rows.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: '#faf8f6', color: COLORS.textMuted, fontSize: 11 }}>
                      <th style={thL}>Дата</th><th style={thL}>Документ</th><th style={thL}>Контрагент</th><th style={thR}>Приход</th><th style={thR}>Расход</th><th style={thR}>Остаток</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9a938a' }}>Движений в периоде нет</td></tr>
                      : rows.map((m: any, i: number) => { const b = badge(m.type); return (
                        <tr key={i} style={{ borderTop: '1px solid #f1efec' }}>
                          <td style={tdL}>{fmtDate(m.date)}</td>
                          <td style={tdL}><span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: b.c }}>{m.number}</span> <span style={{ fontSize: 11, color: b.c }}>{b.txt}</span></td>
                          <td style={tdL}>{m.contragent || '—'}</td>
                          <td style={{ ...tdR, color: m.signed > 0 ? '#2e8a5e' : '#ccc', fontWeight: m.signed > 0 ? 700 : 400 }}>{m.signed > 0 ? `+${qf(m.signed)}` : '—'}</td>
                          <td style={{ ...tdR, color: m.signed < 0 ? '#b4574c' : '#ccc', fontWeight: m.signed < 0 ? 700 : 400 }}>{m.signed < 0 ? `−${qf(Math.abs(m.signed))}` : '—'}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{qf(m.balance)} {m.unit}</td>
                        </tr>
                      ) })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
    </div>
  )
}
