'use client'
import { useEffect, useState, useCallback } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate, statusStyle } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import { finance } from '@/lib/api/finance'
import { fetchDailyReports, updateDailyReport, postAllToBook } from '@/lib/api/reports'

// Бухгалтерия 1:1: Карточки + Отчёты логистов + Смены. Плюс вкладка Финансы (ERP, по решению владельца).
type Tab = 'cards' | 'reports' | 'shifts' | 'finance'

function Btn({ onClick, children, variant, disabled }: { onClick: () => void; children: React.ReactNode; variant?: 'primary'; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 12,
        background: variant === 'primary' ? (disabled ? '#e9e5e0' : COLORS.primary) : COLORS.white, color: variant === 'primary' ? (disabled ? '#a89f95' : '#fff') : COLORS.text,
        boxShadow: variant === 'primary' ? 'none' : '0 0 0 1.5px #d8d3cc' }}>{children}</button>
  )
}

export default function BookkeepingScreen({ orders, orgId, onAction, onReload, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onReload?: () => void; onOpen?: (o: any) => void
}) {
  const [tab, setTab] = useState<Tab>('cards')
  const [fin, setFin] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [reportsErr, setReportsErr] = useState(false)
  const [flash, setFlash] = useState('')
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2000) }

  const loadReports = useCallback(async () => {
    try { setReports(await fetchDailyReports(orgId)); setReportsErr(false) } catch { setReportsErr(true) }
  }, [orgId])

  useEffect(() => { if (tab === 'finance' && !fin) finance(orgId).then(setFin) }, [tab, fin, orgId])
  useEffect(() => { if (tab === 'reports' || tab === 'shifts') loadReports() }, [tab, loadReports])

  const cards = orders.filter(o => o.screen === 'bookkeeping')
  const tabs: Array<[Tab, string]> = [
    ['cards', `Карточки (${cards.length})`], ['reports', 'Отчёты логистов'], ['shifts', 'Смены'], ['finance', 'Финансы'],
  ]

  async function postAll() { const r: any = await postAllToBook(orgId); toast(`Проведено: ${r.count}`); onReload?.() }

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Бухгалтерия</div>
        {tab === 'cards' && <Btn variant="primary" onClick={postAll}>Провести все</Btn>}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
      </div>

      {/* ── КАРТОЧКИ ── */}
      {tab === 'cards' && (
        cards.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952', fontSize: 14 }}>Нет карточек</div>
          : <div style={{ maxWidth: 680 }}>{cards.map(o => (
              <div key={o.id}>
                <OrderCard order={o} actions={[]} onAction={onAction} onOpen={onOpen} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: -4, marginBottom: 12, paddingRight: 4, flexWrap: 'wrap' }}>
                  <Btn onClick={() => onAction(o.id, 'returnToAcc')}>← К учёту</Btn>
                  {!o.invoice && <Btn onClick={() => onAction(o.id, 'createDoc')}>↓ Счёт</Btn>}
                  {!o.fact && <Btn onClick={() => onAction(o.id, 'createDocFact')}>↓ Счёт-фактура</Btn>}
                  {!o.posted1c && <Btn onClick={() => onAction(o.id, 'post1c')}>Провести 1С</Btn>}
                  <Btn variant="primary" disabled={!o.posted1c} onClick={() => o.posted1c && onAction(o.id, 'sendArchive')}>→ Архив</Btn>
                </div>
              </div>
            ))}</div>
      )}

      {/* ── ОТЧЁТЫ ЛОГИСТОВ ── */}
      {tab === 'reports' && <ReportsTab reports={reports} reportsErr={reportsErr} reload={loadReports} toast={toast} />}

      {/* ── СМЕНЫ ── */}
      {tab === 'shifts' && <ShiftsTab reports={reports} reload={loadReports} toast={toast} />}

      {/* ── ФИНАНСЫ (ERP) ── */}
      {tab === 'finance' && <FinancePanel fin={fin} />}
    </div>
  )
}

// Отчёт логиста в стиле закуп-отчёта: ЗАКУП (от кого · товар · приход) → ЦЕНТР-СКЛАД → ПРОДАЖА (кому · расход · коммент).
const RPURPLE = '#7a3aaa'
const rth: React.CSSProperties = { padding: '7px 10px', fontSize: 12, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', color: '#5f5952' }
const rtd: React.CSSProperties = { padding: '8px 10px', fontSize: 13, verticalAlign: 'top', borderTop: '1px solid #f1efec' }
function ReportRows({ rows }: { rows: any[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr>
            <th colSpan={3} style={{ ...rth, background: '#f3eeff', color: RPURPLE, textAlign: 'center', borderRight: '2px solid #e6e2dc' }}>ЗАКУП / ПРИХОД</th>
            <th style={{ ...rth, background: '#eef2ff', color: '#4a5aaa', textAlign: 'center', borderRight: '2px solid #e6e2dc' }}>СКЛАД</th>
            <th colSpan={3} style={{ ...rth, background: '#e8f5ee', color: '#2e8a5e', textAlign: 'center' }}>ПРОДАЖА / РАСХОД</th>
          </tr>
          <tr style={{ background: '#faf9f7' }}>
            <th style={rth}>От кого</th>
            <th style={rth}>Наименование</th>
            <th style={{ ...rth, textAlign: 'right' }}>Приход</th>
            <th style={{ ...rth, textAlign: 'center', borderLeft: '2px solid #e6e2dc', borderRight: '2px solid #e6e2dc' }}>Транзит</th>
            <th style={rth}>Кому</th>
            <th style={{ ...rth, textAlign: 'right' }}>Расход</th>
            <th style={rth}>Коммент / №</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.id}>
              <td style={rtd}>{row.fromWho || '—'}</td>
              <td style={{ ...rtd, fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RalDot code={extractRal(row.name || '')} size={12} />{row.name || '—'}</span></td>
              <td style={{ ...rtd, textAlign: 'right', fontWeight: 700, color: RPURPLE, whiteSpace: 'nowrap' }}>{Number(row.qtyIn) || '—'}</td>
              <td style={{ ...rtd, textAlign: 'center', borderLeft: '2px solid #e6e2dc', borderRight: '2px solid #e6e2dc', fontSize: 12, color: '#4a5aaa', fontWeight: 600 }}>Центр-Склад</td>
              <td style={rtd}>{row.toWho || '—'}</td>
              <td style={{ ...rtd, textAlign: 'right', fontWeight: 700, color: '#2e8a5e', whiteSpace: 'nowrap' }}>{Number(row.qtyOut) || '—'}</td>
              <td style={{ ...rtd, color: '#5f5952' }}>{[row.commentOut || row.commentIn, row.invoiceNum].filter(Boolean).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportsTab({ reports, reportsErr, reload, toast }: { reports: any[]; reportsErr: boolean; reload: () => void; toast: (m: string) => void }) {
  const [filter, setFilter] = useState<'active' | 'done' | 'archive'>('active')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const filtered = reports.filter(r => {
    if (filter === 'active' && r.status !== 'processing' && r.status !== 'draft') return false
    if (filter === 'done' && r.status !== 'done') return false
    if (filter === 'archive' && r.status !== 'archive') return false
    if (from && new Date(r.date) < new Date(from)) return false
    if (to && new Date(r.date) > new Date(to + 'T23:59:59')) return false
    return true
  })
  const count = (k: string) => reports.filter(r => k === 'active' ? (r.status === 'processing' || r.status === 'draft') : r.status === k).length
  const inp: React.CSSProperties = { padding: '4px 8px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontSize: 13, fontFamily: 'inherit' }
  async function setStatus(id: string, status: string, msg: string) { await updateDailyReport(id, status); reload(); toast(msg) }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {([['active', 'Новые'], ['done', 'Принятые'], ['archive', 'Архив']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: filter === k ? COLORS.primary : '#fff', color: filter === k ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc' }}>{l} ({count(k)})</button>
        ))}
        <div style={{ width: 1, height: 20, background: '#e6e2dc' }} />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
        <span style={{ fontSize: 13, color: '#5f5952' }}>—</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} />
        {(from || to) && <button onClick={() => { setFrom(''); setTo('') }} style={{ padding: '4px 8px', borderRadius: 7, border: 'none', background: '#faeaea', color: '#b03020', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Даты</button>}
        <button onClick={reload} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 14, cursor: 'pointer' }}>⟳</button>
      </div>

      {reportsErr
        ? <div style={{ color: '#b03020', fontSize: 14, padding: '20px 0', fontWeight: 600 }}>⚠️ Ошибка загрузки отчётов. Нажмите ⟳ или обновите страницу.</div>
        : filtered.length === 0
          ? <div style={{ color: '#5f5952', fontSize: 14, padding: '20px 0' }}>Нет отчётов</div>
          : filtered.map(r => {
              const label = r.status === 'draft' ? 'Не закрыта' : r.status === 'processing' ? 'Новый' : r.status === 'done' ? 'Принят' : 'Архив'
              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 18, marginBottom: 12, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{r.logist?.name} · {fmtDate(r.date)}</div>
                      {r.comment && <div style={{ fontSize: 13, color: '#5f5952', marginTop: 2 }}>{r.comment}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={statusStyle(label)}>{label}</span>
                      {r.status === 'processing' && <Btn variant="primary" onClick={() => setStatus(r.id, 'done', '✓ Отчёт принят')}>✓ Принять</Btn>}
                      {r.status === 'done' && <Btn onClick={() => setStatus(r.id, 'archive', '✓ Отправлен в архив')}>→ Архив</Btn>}
                    </div>
                  </div>
                  <ReportRows rows={r.rows} />
                </div>
              )
            })}
    </div>
  )
}

function ShiftsTab({ reports, reload, toast }: { reports: any[]; reload: () => void; toast: (m: string) => void }) {
  const archived = reports.filter(r => r.status === 'archive')
  const byDate: Record<string, any[]> = {}
  archived.forEach(r => { const d = r.date ? String(r.date).slice(0, 10) : 'unknown'; (byDate[d] = byDate[d] || []).push(r) })
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
  const doneCount = reports.filter(r => r.status === 'done').length

  async function closeShift() {
    const toClose = reports.filter(r => r.status === 'done')
    if (toClose.length === 0) { toast('Нет принятых отчётов для закрытия'); return }
    await Promise.all(toClose.map(r => updateDailyReport(r.id, 'archive')))
    reload(); toast(`✓ Смена закрыта — ${toClose.length} отчётов`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: '#5f5952' }}>Принятых отчётов: <strong style={{ color: '#26231f' }}>{doneCount}</strong></div>
        <button onClick={closeShift} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Закрыть смену</button>
      </div>

      {dates.length === 0
        ? <div style={{ color: '#5f5952', fontSize: 14, padding: '20px 0' }}>Нет закрытых смен</div>
        : dates.map(date => {
            const reps = byDate[date]
            const totalRows = reps.reduce((s, r) => s + r.rows.length, 0)
            return (
              <div key={date} style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>📅 {new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                    <div style={{ fontSize: 13, color: '#5f5952', marginTop: 2 }}>{reps.length} логистов · {totalRows} позиций</div>
                  </div>
                  <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#e8f5ee', color: '#2e8a5e', fontWeight: 600 }}>✓ Закрыта</span>
                </div>
                {reps.map((r: any) => (
                  <div key={r.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primary, marginBottom: 4 }}>🚚 {r.logist?.name}</div>
                    {r.rows.length ? <ReportRows rows={r.rows} /> : <div style={{ fontSize: 13, color: '#837c72' }}>Нет строк</div>}
                  </div>
                ))}
              </div>
            )
          })}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmtMoney(value)} ₸</div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function FinancePanel({ fin }: { fin: any }) {
  if (!fin) return <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка финансов…</div>
  const cs = fin.contragents || []
  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Дебиторка (нам должны)" value={fin.receivable} color="#2e8a5e" />
        <KpiCard label="Кредиторка (мы должны)" value={fin.payable} color="#b03020" />
        <KpiCard label="Касса (приход−расход)" value={fin.cash} color={COLORS.primary} />
        <KpiCard label="Склад (стоимость)" value={fin.stockValue} color="#4a5aaa" />
      </div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>БАЛАНС ПО КОНТРАГЕНТАМ</div>
        {cs.length === 0 ? <div style={{ padding: 20, color: COLORS.textMuted, fontSize: 14 }}>Нет долгов</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Контрагент', 'Нам должны', 'Мы должны'].map(h => <th key={h} style={{ textAlign: h === 'Контрагент' ? 'left' : 'right', padding: '8px 16px' }}>{h}</th>)}</tr></thead>
            <tbody>
              {cs.map((c: any) => (
                <tr key={c.id} style={{ borderTop: '1px solid #f1efec' }}>
                  <td style={{ padding: '8px 16px' }}>{c.name}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: c.theyOwe > 0.001 ? '#2e8a5e' : COLORS.textLight, fontWeight: 600 }}>{c.theyOwe > 0.001 ? `${fmtMoney(c.theyOwe)} ₸` : '—'}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: c.weOwe > 0.001 ? '#b03020' : COLORS.textLight, fontWeight: 600 }}>{c.weOwe > 0.001 ? `${fmtMoney(c.weOwe)} ₸` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
