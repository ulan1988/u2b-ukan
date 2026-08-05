'use client'
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { isPurchase, fmtMoney } from '@/lib/adminFmt'
import { logistOrders, setPosStatus } from '@/lib/api/orders'
import { logout } from '@/lib/api/auth'
import { getDraft, addRow, deleteRow, closeShift } from '@/lib/api/reports'
import { useLiveData } from '@/lib/live'

const STEPS = ['В работе', 'В пути', 'Доставлено']
const STEP_STYLE: Record<string, { bg: string; color: string }> = {
  'В работе': { bg: '#fff0ea', color: '#c0532a' }, 'В пути': { bg: '#fdf8e1', color: '#8a6f00' }, 'Доставлено': { bg: '#e8f5ee', color: '#2e8a5e' },
}

export default function LogistPortal({ user }: { user: { name: string } }) {
  const [orders, setOrders] = useState<any[]>([])
  const [tab, setTab] = useState<'active' | 'done' | 'shift'>('active')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    logistOrders().then(setOrders).finally(() => setLoading(false))
  }, [])
  useLiveData(load, [])

  async function setPos(cardId: string, posId: string, status: string) { await setPosStatus(cardId, status, posId); load() }

  const isDone = (o: any) => (o.positions || []).length > 0 && o.positions.every((p: any) => p.status === 'Доставлено')
  const list = orders.filter(o => (tab === 'done' ? isDone(o) : !isDone(o)))

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {/* Шапка */}
      <div style={{ background: COLORS.dark, color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="U2B" style={{ width: 38, height: 38, borderRadius: 9 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Логист</div>
          <div style={{ fontSize: 12, color: COLORS.sidebar.muted }}>{user.name}</div>
        </div>
        <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: COLORS.sidebar.badge, border: 'none', color: COLORS.sidebar.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Выйти</button>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', background: '#fff', borderRadius: 10, padding: 4, marginBottom: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          {([['active', 'Активные'], ['done', 'Выполнено'], ['shift', '📊 Смена']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: tab === k ? COLORS.primary : 'transparent', color: tab === k ? '#fff' : COLORS.textMuted }}>{l}</button>
          ))}
        </div>

        {tab === 'shift' ? <ShiftReport /> : loading ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, fontSize: 14 }}>{tab === 'done' ? 'Пока ничего не выполнено' : 'Нет активных доставок'}</div>
            : list.map(o => (
              <div key={o.id} style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{o.id}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isPurchase(o) ? '#f3eeff' : '#e8f5ee', color: isPurchase(o) ? '#7a3aaa' : '#2e8a5e' }}>{isPurchase(o) ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: COLORS.textMuted }}>{o.fromName}</span>
                </div>
                {(o.positions || []).map((p: any) => (
                  <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid #f6f3f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>{p.name1c || p.oral}</span>
                      <span style={{ fontSize: 13, color: COLORS.textLight }}>{Number(p.qty)} {p.unit} · {fmtMoney(Number(p.qty) * Number(p.price))} ₸</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {STEPS.map(s => {
                        const active = p.status === s; const st = STEP_STYLE[s]
                        return <button key={s} onClick={() => setPos(o.id, p.id, s)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: active ? st.bg : '#f4f1ed', color: active ? st.color : '#9a938a', boxShadow: active ? `inset 0 0 0 1.5px ${st.color}44` : 'none' }}>{s}</button>
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
      </div>
    </div>
  )
}

// ─── Смена логиста: суточный отчёт приход/расход ──────────────────────────────
function ShiftReport() {
  const [rows, setRows] = useState<any[]>([])
  const [f, setF] = useState({ fromWho: '', name: '', qtyIn: '', commentIn: '', toWho: '', qtyOut: '', invoiceNum: '' })
  const [closed, setClosed] = useState(false)

  async function load() { const d: any = await getDraft(); setRows(d.rows || []); setClosed(d.report?.status === 'done') }
  useEffect(() => { load() }, [])

  async function add() {
    if (!f.name.trim()) return
    await addRow(f)
    setF({ fromWho: '', name: '', qtyIn: '', commentIn: '', toWho: '', qtyOut: '', invoiceNum: '' })
    load()
  }
  async function del(id: string) { await deleteRow(id); load() }
  async function close() { await closeShift(); load() }

  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontFamily: 'inherit', fontSize: 13, outline: 'none', width: '100%' }
  return (
    <div>
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 10 }}>ДОБАВИТЬ СТРОКУ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input style={inp} placeholder="Товар" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input style={inp} placeholder="№ накладной" value={f.invoiceNum} onChange={e => setF({ ...f, invoiceNum: e.target.value })} />
          <input style={inp} placeholder="От кого (приход)" value={f.fromWho} onChange={e => setF({ ...f, fromWho: e.target.value })} />
          <input style={inp} type="number" placeholder="Кол-во приход" value={f.qtyIn} onChange={e => setF({ ...f, qtyIn: e.target.value })} />
          <input style={inp} placeholder="Кому (расход)" value={f.toWho} onChange={e => setF({ ...f, toWho: e.target.value })} />
          <input style={inp} type="number" placeholder="Кол-во расход" value={f.qtyOut} onChange={e => setF({ ...f, qtyOut: e.target.value })} />
        </div>
        <button onClick={add} disabled={!f.name.trim()} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: f.name.trim() ? 1 : 0.5 }}>＋ Добавить</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1efec' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#5f5952' }}>СТРОКИ СМЕНЫ ({rows.length})</span>
          {!closed && rows.length > 0 && <button onClick={close} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 7, border: 'none', background: '#2e8a5e', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Закрыть смену</button>}
          {closed && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#2e8a5e', fontWeight: 700 }}>✅ Смена закрыта</span>}
        </div>
        {rows.length === 0 ? <div style={{ padding: 20, color: COLORS.textMuted, fontSize: 14 }}>Пусто</div>
          : rows.map((r: any) => (
            <div key={r.id} style={{ padding: '10px 14px', borderTop: '1px solid #f6f3f0', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, flex: 1 }}>{r.name}</span>
                {!closed && <button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', color: '#b0a99f', cursor: 'pointer', fontSize: 16 }}>×</button>}
              </div>
              <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                {Number(r.qtyIn) > 0 && `↓ ${r.qtyIn} от ${r.fromWho || '—'}  `}
                {Number(r.qtyOut) > 0 && `↑ ${r.qtyOut} кому ${r.toWho || '—'}  `}
                {r.invoiceNum && `№${r.invoiceNum}`}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
