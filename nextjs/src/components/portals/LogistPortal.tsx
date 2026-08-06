'use client'
// Портал логиста — портирован из Улкана 1:1. Вкладки 💰Продажа(канбан)/🛒Закупки/
// ✅Выполнено/⚡Изменения/➕Новый/📊Смена. Адаптировано под модель u2b (respUserId/
// supplierId/fromName). Полный каталог-пикер довяжется в NomPicker (шаг 4).
import { useState, useEffect, useCallback, useRef } from 'react'
import { COLORS } from '@/lib/colors'
import { isPurchase } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import DateFilter, { inPeriod, type Period } from '@/components/DateFilter'
import { logistOrders, setPosStatus, createOrder, updatePosition, addPosition, listMessages, sendMessage } from '@/lib/api/orders'
import { fetchRefs } from '@/lib/api/refs'
import { listNotifications, markRead } from '@/lib/api/notifications'
import { getDraft, pastDrafts as apiPast, addRow as apiAddRow, updateRow as apiUpdRow, deleteRow as apiDelRow, closeShift } from '@/lib/api/reports'
import { logout } from '@/lib/api/auth'
import { useLiveData } from '@/lib/live'

const PRIMARY = '#d4613a', DARK = '#211f1c', DARK2 = '#322f2b'
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
type Tab = 'in' | 'buy' | 'out' | 'changes' | 'new' | 'shift'

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2300); return () => clearTimeout(t) }, [onClose])
  return <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: DARK, color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, whiteSpace: 'nowrap' }}>{msg}</div>
}

export default function LogistPortal({ user }: { user: { id: string; name: string; orgId: string } }) {
  const [tab, setTab] = useState<Tab>('in')
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [supEditPos, setSupEditPos] = useState<string | null>(null)
  const [addingCardId, setAddingCardId] = useState<string | null>(null)
  const [chatOpenPos, setChatOpenPos] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [period, setPeriod] = useState<Period>('all'); const [day, setDay] = useState('')
  const showMsg = useCallback((m: string) => setToast(m), [])
  const supName = (id?: string) => suppliers.find(s => s.id === id)?.name || ''

  // Новый заказ
  const [newTo, setNewTo] = useState(''); const [newName, setNewName] = useState(''); const [newQty, setNewQty] = useState(''); const [newLoading, setNewLoading] = useState(false)

  // Смена
  const [shiftRows, setShiftRows] = useState<any[]>([]); const [reportComment, setReportComment] = useState('')
  const [showAddRow, setShowAddRow] = useState(false); const [editRow, setEditRow] = useState<any>(null)
  const [addData, setAddData] = useState({ name: '', qtyIn: '', fromWho: '', commentIn: '', toWho: '', qtyOut: '', commentOut: '', invoiceNum: '' })
  const [reportSent, setReportSent] = useState(false); const [reportLoading, setReportLoading] = useState(false)
  const [editingDate, setEditingDate] = useState<string | null>(null); const [pastDrafts, setPastDrafts] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [o, n] = await Promise.all([logistOrders(), listNotifications()])
    setOrders(o); setNotifications(n); setLoading(false)
  }, [])
  const pausedRef = useRef(false); pausedRef.current = supEditPos !== null || addingCardId !== null || chatOpenPos !== null
  useLiveData(() => { if (!pausedRef.current) load() }, [])
  useEffect(() => { fetchRefs().then((r: any) => setSuppliers((r.contragents || []).filter((c: any) => c.kind !== 'client').map((c: any) => ({ id: c.id, name: c.name })))) }, [])
  useEffect(() => { setSupEditPos(null); setAddingCardId(null); setChatOpenPos(null) }, [tab])

  const loadDraft = useCallback(async (date?: string | null) => { const d: any = await getDraft(date || undefined); setShiftRows((d.rows || []).map((r: any) => ({ ...r, auto: !!r.posId }))); setReportComment(d.report?.comment || '') }, [])
  const loadPast = useCallback(async () => { setPastDrafts(await apiPast() as any) }, [])
  useEffect(() => { loadDraft(null); loadPast() }, [loadDraft, loadPast])

  const visOrders = orders.filter(o => inPeriod(o.createdAt, period, day))
  const posInAll = visOrders.flatMap(o => (o.positions || []).filter((p: any) => p.leg === 2 && p.status !== 'Доставлено').map((p: any) => ({ pos: p, order: o })))
  const posIn = posInAll.filter(x => !isPurchase(x.order))
  const posBuy = posInAll.filter(x => isPurchase(x.order))
  const posOut = visOrders.flatMap(o => (o.positions || []).filter((p: any) => p.status === 'Доставлено').map((p: any) => ({ pos: p, order: o })))

  const changedIds = new Set(notifications.filter(n => !n.read && n.cardId).map(n => n.cardId))
  const posChanged = orders.flatMap(o => changedIds.has(o.id) ? (o.positions || []).map((p: any) => ({ pos: p, order: o })) : [])
  const changedCount = new Set(posChanged.map(x => x.order.id)).size
  async function markCardSeen(cardId: string) {
    const unread = notifications.filter(n => n.cardId === cardId && !n.read)
    setNotifications(prev => prev.map(n => n.cardId === cardId ? { ...n, read: true } : n))
    await Promise.all(unread.map(n => markRead(n.id)))
  }

  async function saveSupplier(cardId: string, posId: string, supplierId: string) { await updatePosition(cardId, posId, { supplierId }); showMsg('✓ Поставщик изменён'); setSupEditPos(null); load() }
  async function handleStatus(cardId: string, posId: string, status: string) { setUpdating(posId); await setPosStatus(cardId, status, posId); showMsg(`✓ ${status}`); await load(); if (!editingDate) await loadDraft(null); setUpdating(null) }
  async function handleNew() {
    if (!newTo || !newName || !newQty) { showMsg('Заполните все поля'); return }
    setNewLoading(true)
    const r = await createOrder({ orgId: user.orgId, kind: 'sale', source: 'responsible_portal', fromName: newTo, positions: [{ name1c: newName, oral: newName, qty: Number(newQty), unit: 'шт', respUserId: user.id }] })
    setNewLoading(false)
    if (r.ok) { setNewTo(''); setNewName(''); setNewQty(''); showMsg('✓ Заказ создан'); load() }
  }
  async function addPos(cardId: string, name: string, qty: string, supplierId: string) {
    if (!name.trim()) return
    await addPosition(cardId, { name1c: name, oral: name, qty: Number(qty) || 0, unit: 'шт', respUserId: user.id, supplierId: supplierId || undefined })
    setAddingCardId(null); load(); showMsg('✓ Позиция добавлена')
  }

  async function saveRow() {
    if (!addData.name) { showMsg('Укажите наименование'); return }
    if (editRow) await apiUpdRow(editRow.id, addData); else await apiAddRow(addData, editingDate || undefined)
    setAddData({ name: '', qtyIn: '', fromWho: '', commentIn: '', toWho: '', qtyOut: '', commentOut: '', invoiceNum: '' }); setEditRow(null); setShowAddRow(false); await loadDraft(editingDate)
  }
  async function deleteRow(id: string) { await apiDelRow(id); await loadDraft(editingDate) }
  function openEdit(row: any) { setAddData({ name: row.name, qtyIn: String(row.qtyIn || ''), fromWho: row.fromWho, commentIn: row.commentIn, toWho: row.toWho, qtyOut: String(row.qtyOut || ''), commentOut: row.commentOut, invoiceNum: row.invoiceNum || '' }); setEditRow(row); setShowAddRow(true) }
  async function submitReport() {
    if (shiftRows.filter(r => r.name).length === 0) { showMsg('Добавьте хотя бы одну строку'); return }
    setReportLoading(true); await closeShift(editingDate || undefined); setShiftRows([]); setReportComment(''); setReportSent(true)
    if (editingDate) setEditingDate(null); loadPast(); showMsg('✓ Отчёт отправлен!'); setReportLoading(false)
  }
  async function openPastDraft(date: string) { setEditingDate(date); setReportSent(false); await loadDraft(date) }
  async function backToToday() { setEditingDate(null); setReportSent(false); await loadDraft(null) }

  const shiftValid = shiftRows.filter(r => r.name)
  const shiftIn = shiftValid.reduce((s, r) => s + (Number(r.qtyIn) || 0), 0)
  const shiftOut = shiftValid.reduce((s, r) => s + (Number(r.qtyOut) || 0), 0)
  const inp: React.CSSProperties = { width: '100%', padding: '10px 13px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }

  function StatusBtns({ cardId, posId, posStatus, compact }: { cardId: string; posId: string; posStatus: string; compact?: boolean }) {
    const btns = [{ label: 'ПРИНЯЛ', status: 'В работе' }, { label: 'В РАБОТЕ', status: 'В пути' }, { label: 'ДОСТАВЛЕНО', status: 'Доставлено' }]
    const activeIdx = posStatus === 'В работе' ? 0 : posStatus === 'В пути' ? 1 : posStatus === 'Доставлено' ? 2 : -1
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: compact ? 4 : 6, marginTop: compact ? 8 : 12 }}>
        {btns.map((b, i) => <button key={b.label} onClick={() => handleStatus(cardId, posId, b.status)} disabled={updating === posId || posStatus === 'Доставлено'} style={{ padding: compact ? '6px 2px' : '10px 4px', borderRadius: compact ? 6 : 8, border: 'none', fontWeight: 700, fontSize: compact ? 10.5 : 12, cursor: 'pointer', fontFamily: 'inherit', background: i <= activeIdx ? PRIMARY : '#f1efec', color: i <= activeIdx ? '#fff' : '#5f5952', opacity: updating === posId ? .6 : 1 }}>{b.label}</button>)}
      </div>
    )
  }

  function PosCard({ pos, order, compact }: { pos: any; order: any; compact?: boolean }) {
    const editable = pos.status !== 'Доставлено'
    const [addN, setAddN] = useState(''); const [addQ, setAddQ] = useState(''); const [addS, setAddS] = useState('')
    const [chat, setChat] = useState<any[]>([]); const [msg, setMsg] = useState('')
    async function openChat() { const opening = chatOpenPos !== pos.id; setChatOpenPos(opening ? pos.id : null); if (opening) setChat(await listMessages(order.id)) }
    async function send() { const t = msg.trim(); if (!t) return; setMsg(''); await sendMessage(order.id, t); setChat(await listMessages(order.id)) }
    return (
      <div style={{ background: isPurchase(order) ? '#faf7fd' : '#fff', borderRadius: compact ? 12 : 14, padding: compact ? 11 : 16, marginBottom: compact ? 9 : 12, borderLeft: `4px solid ${isPurchase(order) ? '#7a3aaa' : '#2e8a5e'}`, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: compact ? 14 : 16, flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}><RalDot code={extractRal(pos.name1c || pos.oral)} />{pos.name1c || pos.oral}</div>
          <span style={{ fontWeight: 700, fontSize: compact ? 15 : 18, color: PRIMARY, marginLeft: 8 }}>{Number(pos.qty)} {pos.unit}</span>
        </div>
        <div style={{ fontSize: compact ? 12.5 : 14, color: '#5f5952', marginBottom: 4 }}>{order.fromName || '—'}</div>
        {editable && (supEditPos === pos.id ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <select autoFocus value={pos.supplierId || ''} onChange={e => saveSupplier(order.id, pos.id, e.target.value)} style={{ flex: 1, padding: '7px 8px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
              <option value="">— поставщик —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => setSupEditPos(null)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
        ) : (
          <div onClick={() => setSupEditPos(pos.id)} style={{ fontSize: 13, color: '#5f5952', marginBottom: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }} title="Изменить поставщика">🏭 {supName(pos.supplierId) || <span style={{ color: '#b8b1a6' }}>поставщик не указан</span>} <span style={{ color: PRIMARY, fontWeight: 700 }}>✎</span></div>
        ))}
        {order.comment && <div style={{ fontSize: 13, background: '#f8f6f3', borderRadius: 6, padding: '6px 10px', marginBottom: 6 }}>{String(order.comment).slice(0, 80)}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: PRIMARY, fontWeight: 600 }}>{order.id}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: isPurchase(order) ? '#f3eeff' : '#e8f5ee', color: isPurchase(order) ? '#7a3aaa' : '#2e8a5e' }}>{isPurchase(order) ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
          {pos.late && <span style={{ fontSize: 12, background: '#faeaea', color: '#b03020', padding: '1px 6px', borderRadius: 20, fontWeight: 600 }}>ПРОСРОЧ.</span>}
          <span style={{ fontSize: 12, background: pos.status === 'Доставлено' ? '#e8f5ee' : '#fff0ea', color: pos.status === 'Доставлено' ? '#2e8a5e' : '#c0532a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{pos.status}</span>
        </div>
        <StatusBtns cardId={order.id} posId={pos.id} posStatus={pos.status} compact={compact} />
        <button onClick={openChat} style={{ marginTop: compact ? 7 : 10, width: '100%', padding: compact ? '6px' : '8px', border: 'none', borderRadius: 8, background: chatOpenPos === pos.id ? PRIMARY : '#f1efec', color: chatOpenPos === pos.id ? '#fff' : '#5f5952', cursor: 'pointer', fontSize: compact ? 12.5 : 14, fontFamily: 'inherit', fontWeight: 600 }}>💬 Чат</button>
        {chatOpenPos === pos.id && (
          <div style={{ marginTop: 10, paddingTop: 4, borderTop: '1px solid #f1efec' }}>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {chat.length === 0 ? <div style={{ color: '#837c72', fontSize: 13 }}>Сообщений нет</div> : chat.map((m: any) => <div key={m.id} style={{ background: '#f8f6f3', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}><b style={{ color: PRIMARY }}>{m.userName}</b>: {m.text}</div>)}
            </div>
            <div style={{ display: 'flex', gap: 6 }}><input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Сообщение…" style={{ ...inp, padding: '8px 10px' }} /><button onClick={send} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>▶</button></div>
          </div>
        )}
        {editable && (addingCardId === order.id ? (
          <div style={{ background: '#f8f6f3', borderRadius: 8, padding: 10, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952' }}>НОВАЯ ПОЗИЦИЯ</div>
            <input value={addN} onChange={e => setAddN(e.target.value)} placeholder="Наименование" style={{ ...inp, padding: '7px 9px' }} />
            <select value={addS} onChange={e => setAddS(e.target.value)} style={{ ...inp, padding: '7px 9px' }}><option value="">— поставщик —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <div style={{ display: 'flex', gap: 6 }}><input type="number" value={addQ} onChange={e => setAddQ(e.target.value)} placeholder="Кол-во" style={{ ...inp, width: 90, padding: '7px 9px' }} /><button onClick={() => addPos(order.id, addN, addQ, addS)} disabled={!addN.trim()} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: addN.trim() ? 1 : .5 }}>Добавить</button><button onClick={() => setAddingCardId(null)} style={{ padding: '7px 12px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Отмена</button></div>
          </div>
        ) : (
          <button onClick={() => setAddingCardId(order.id)} style={{ marginTop: 10, width: '100%', padding: '9px', border: '1.5px dashed #d8d3cc', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 14, color: '#5f5952', fontFamily: 'inherit', fontWeight: 600 }}>＋ Добавить позицию</button>
        ))}
      </div>
    )
  }

  const empty = (icon: string, text: string) => <div style={{ background: '#fff', borderRadius: 14, padding: 36, textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div><div style={{ color: '#5f5952' }}>{text}</div></div>

  return (
    <div style={{ background: '#dedbd6', minHeight: '100vh', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      <div style={{ background: DARK, padding: '14px 20px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 432, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="U2B" style={{ width: 42, height: 42, borderRadius: 10, display: 'block' }} />
            <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>U2B · Портал</div><div style={{ color: '#8c857a', fontSize: 12 }}>{user.name}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: DARK2, border: 'none', borderRadius: 7, padding: '6px 10px', color: loading ? PRIMARY : '#cfc9c0', cursor: 'pointer', fontSize: 14 }}>⟳</button>
            <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: DARK2, border: 'none', borderRadius: 7, padding: '6px 12px', color: '#cfc9c0', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Выйти</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 432, margin: '0 auto', padding: '16px 66px 40px 14px' }}>
        {tab === 'in' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>💰 Продажа · по заказчикам</div>
            <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
            {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div>
              : posIn.length === 0 ? empty('✅', 'Нет позиций к доставке')
              : (() => {
                const groups: Record<string, typeof posIn> = {}
                for (const it of posIn) { const k = ((it.order.fromName || '—').trim()) || '—'; (groups[k] = groups[k] || []).push(it) }
                const cols = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
                return (
                  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginTop: 10, alignItems: 'flex-start' }}>
                    {cols.map(([client, items]) => (
                      <div key={client} style={{ flexShrink: 0, width: 312, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 230px)' }}>
                        <div style={{ padding: '9px 12px', background: DARK, borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, letterSpacing: '.05em' }}>ЗАКАЗЧИК</div><div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client}</div></div>
                          <span style={{ background: PRIMARY, color: '#fff', fontSize: 12, padding: '1px 8px', borderRadius: 20, fontWeight: 700 }}>{items.length}</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', background: '#f4f2ef', borderRadius: '0 0 12px 12px', padding: '10px 8px 4px' }}>{items.map(({ pos, order }) => <PosCard key={pos.id} pos={pos} order={order} compact />)}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}
          </div>
        )}
        {tab === 'buy' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#7a3aaa' }}>🛒 Закупки · на Центр-Склад</div>
            <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 14 }}>Закупи товар и отметь позиции доставленными.</div>
            <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
            {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div> : posBuy.length === 0 ? empty('✅', 'Нет активных закупов') : posBuy.map(({ pos, order }) => <PosCard key={`buy-${pos.id}`} pos={pos} order={order} />)}
          </div>
        )}
        {tab === 'out' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>✅ Выполнено · доставлено мной</div>
            <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
            {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div> : posOut.length === 0 ? empty('📭', 'Пока нет доставленных позиций') : posOut.map(({ pos, order }) => <PosCard key={`out-${pos.id}`} pos={pos} order={order} />)}
          </div>
        )}
        {tab === 'changes' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>⚡ Изменения</div>
            <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 14 }}>Кто-то изменил ваши карточки. Откройте и подтвердите.</div>
            {posChanged.length === 0 ? empty('✅', 'Нет новых изменений') : Array.from(new Set(posChanged.map(x => x.order.id))).map(cardId => {
              const items = posChanged.filter(x => x.order.id === cardId); const order = items[0].order; const note = notifications.find(n => n.cardId === cardId && !n.read)
              return (
                <div key={cardId} className="uk-blink" style={{ background: '#fff', border: '1.5px solid #f0c9b8', borderLeft: '4px solid #c1121c', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 14 }}>{order.id}</span><span style={{ fontSize: 12, color: '#5f5952' }}>{order.fromName}</span><button onClick={() => markCardSeen(cardId)} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>✓ Просмотрено</button></div>
                  {note && <div style={{ fontSize: 13, color: '#c0532a', marginBottom: 8, fontWeight: 600 }}>{note.text}</div>}
                  {items.map(({ pos, order }) => <PosCard key={`chg-${pos.id}`} pos={pos} order={order} />)}
                </div>
              )
            })}
          </div>
        )}
        {tab === 'new' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>➕ Новый заказ</div>
            <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
              <div style={{ marginBottom: 14 }}><label style={lbl}>КОМУ *</label><input style={inp} value={newTo} onChange={e => setNewTo(e.target.value)} placeholder="Получатель..." /></div>
              <div style={{ marginBottom: 14 }}><label style={lbl}>НАИМЕНОВАНИЕ *</label><input style={inp} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Товар..." /></div>
              <div style={{ marginBottom: 20 }}><label style={lbl}>КОЛ-ВО *</label><input style={inp} type="number" value={newQty} onChange={e => setNewQty(e.target.value)} /></div>
              <button onClick={handleNew} disabled={newLoading} style={{ width: '100%', padding: '13px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>{newLoading ? 'Создание...' : 'СОЗДАТЬ →'}</button>
            </div>
          </div>
        )}
        {tab === 'shift' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>📊 Отчёт по смене</div>
            <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 16 }}>{new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            {editingDate && !reportSent && <div style={{ background: '#fff0ea', border: '1.5px solid #e6c9b8', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><span style={{ fontSize: 14, color: '#c0532a', fontWeight: 600 }}>✎ Смена за {editingDate.split('-').reverse().join('.')}</span><button onClick={backToToday} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e6c9b8', background: '#fff', color: '#c0532a', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>← К сегодняшней</button></div>}
            {!editingDate && !reportSent && pastDrafts.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#8a6f00', letterSpacing: '.04em', marginBottom: 8 }}>⚠ НЕЗАКРЫТЫЕ СМЕНЫ</div>
                {pastDrafts.map(pd => <div key={pd.id} style={{ background: '#fff', border: '1.5px solid #f0d98a', borderLeft: '4px solid #d4a017', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><div><div style={{ fontSize: 14, fontWeight: 700 }}>Смена {String(pd.date).split('-').reverse().join('.')}</div><div style={{ fontSize: 13, color: '#8a6f00', marginTop: 2 }}>не закрыта · {pd.rowCount} строк</div></div><button onClick={() => openPastDraft(pd.date)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Открыть →</button></div>)}
              </div>
            )}
            {reportSent ? (
              <div><div style={{ background: '#e8f5ee', borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 16 }}><div style={{ fontSize: 36, marginBottom: 8 }}>✅</div><div style={{ fontWeight: 700, fontSize: 18, color: '#2e8a5e' }}>Отчёт отправлен!</div></div><button onClick={() => setReportSent(false)} style={{ width: '100%', padding: '12px', background: '#fff', border: '1.5px solid #e6e2dc', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Новый отчёт</button></div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                  {[{ label: 'Всего', val: shiftValid.length, bg: '#fff', color: DARK }, { label: 'Приход', val: shiftIn, bg: '#e8f5ee', color: '#2e8a5e' }, { label: 'Расход', val: shiftOut, bg: '#fff0ea', color: '#c0532a' }].map(({ label, val, bg, color }) => <div key={label} style={{ background: bg, borderRadius: 10, padding: '12px', textAlign: 'center', boxShadow: '0 0 0 1.5px #e6e2dc' }}><div style={{ fontWeight: 700, fontSize: 24, color }}>{val}</div><div style={{ fontSize: 12, color: '#5f5952', marginTop: 2 }}>{label}</div></div>)}
                </div>
                {shiftValid.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                    <thead><tr style={{ background: '#f8f6f3' }}>{['НАИМ.', 'ОТ КОГО', 'ШТ', 'КОМУ', 'ШТ', '№ НАКЛ.', ''].map((h, hi) => <th key={hi} style={{ padding: '8px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                    <tbody>{shiftValid.map(r => <tr key={r.id} style={{ borderTop: '1px solid #f1efec', background: r.auto ? '#fafff8' : '#fff' }}><td style={{ padding: '8px', fontSize: 13, fontWeight: 500 }}>{r.name}{r.auto && <span style={{ fontSize: 11, color: '#2e8a5e', marginLeft: 4 }}>авто</span>}</td><td style={{ padding: '8px', fontSize: 13 }}>{r.fromWho || '—'}</td><td style={{ padding: '8px', fontSize: 13 }}>{Number(r.qtyIn) || '—'}</td><td style={{ padding: '8px', fontSize: 13 }}>{r.toWho || '—'}</td><td style={{ padding: '8px', fontSize: 13 }}>{Number(r.qtyOut) || '—'}</td><td style={{ padding: '8px', fontSize: 13, color: '#5f5952' }}>{r.invoiceNum || '—'}</td><td style={{ padding: '8px' }}><div style={{ display: 'flex', gap: 3 }}><button onClick={() => openEdit(r)} style={{ padding: '3px 6px', borderRadius: 5, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 12 }}>✏️</button><button onClick={() => deleteRow(r.id)} style={{ padding: '3px 6px', borderRadius: 5, border: '1.5px solid #faeaea', background: '#fff', cursor: 'pointer', fontSize: 12 }}>🗑</button></div></td></tr>)}</tbody>
                  </table></div></div>
                )}
                <button onClick={() => { setEditRow(null); setAddData({ name: '', qtyIn: '', fromWho: '', commentIn: '', toWho: '', qtyOut: '', commentOut: '', invoiceNum: '' }); setShowAddRow(true) }} style={{ width: '100%', padding: '11px', border: '2px dashed #d8d3cc', borderRadius: 10, background: 'none', cursor: 'pointer', fontSize: 14, color: '#5f5952', fontFamily: 'inherit', marginBottom: 12 }}>+ Добавить строку</button>
                <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12 }}><div style={{ marginBottom: 12 }}><label style={lbl}>ДЕНЬ СМЕНЫ</label><div style={{ ...inp, background: '#f8f6f3', color: '#5f5952' }}>{(editingDate || todayStr()).split('-').reverse().join('.')}{editingDate ? ' · прошлая смена' : ' · сегодня'}</div></div><div><label style={lbl}>КОММЕНТАРИЙ</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={reportComment} onChange={e => setReportComment(e.target.value)} placeholder="Общий комментарий..." /></div></div>
                <button onClick={submitReport} disabled={reportLoading || shiftValid.length === 0} style={{ width: '100%', padding: '15px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', opacity: reportLoading || shiftValid.length === 0 ? .5 : 1 }}>{reportLoading ? 'Отправка...' : '✓ ЗАКРЫТЬ СМЕНУ И ОТПРАВИТЬ В БУХГАЛТЕРИЮ'}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddRow && (
        <div onClick={() => setShowAddRow(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', width: '100%', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 20 }}>{editRow ? 'Редактировать строку' : 'Новая строка'}</div>
            {[{ f: 'toWho', l: 'КОМУ (клиент) *', t: 'text' }, { f: 'qtyOut', l: 'КОЛ-ВО (клиенту)', t: 'number' }, { f: 'commentOut', l: 'КОММЕНТАРИЙ (клиенту)', t: 'text' }, { f: 'invoiceNum', l: '№ НАКЛАДНОЙ', t: 'text' }].map(({ f, l, t }) => <div key={f} style={{ marginBottom: 12 }}><label style={lbl}>{l}</label><input style={inp} type={t} value={(addData as any)[f]} onChange={e => setAddData(prev => ({ ...prev, [f]: e.target.value }))} /></div>)}
            <div style={{ height: 1, background: '#f1efec', margin: '8px 0 12px' }} />
            {[{ f: 'fromWho', l: 'ОТ КОГО (поставщик) *', t: 'text' }, { f: 'name', l: 'НАИМЕНОВАНИЕ ТОВАРА *', t: 'text' }, { f: 'qtyIn', l: 'КОЛ-ВО (от поставщика)', t: 'number' }, { f: 'commentIn', l: 'КОММЕНТАРИЙ (приход)', t: 'text' }].map(({ f, l, t }) => <div key={f} style={{ marginBottom: 12 }}><label style={lbl}>{l}</label><input style={inp} type={t} value={(addData as any)[f]} onChange={e => setAddData(prev => ({ ...prev, [f]: e.target.value }))} /></div>)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}><button onClick={() => setShowAddRow(false)} style={{ padding: '12px', borderRadius: 10, border: '1.5px solid #e6e2dc', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Отмена</button><button onClick={saveRow} style={{ padding: '12px', borderRadius: 10, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>{editRow ? 'Сохранить' : 'Добавить →'}</button></div>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[{ key: 'in' as Tab, icon: '💰', label: 'Продажа', badge: posIn.length, blink: false }, { key: 'buy' as Tab, icon: '🛒', label: 'Закупки', badge: posBuy.length, blink: false }, { key: 'out' as Tab, icon: '✅', label: 'Выполнено', badge: posOut.length, blink: false }, { key: 'changes' as Tab, icon: '⚡', label: 'Изменения', badge: changedCount, blink: changedCount > 0 }, { key: 'new' as Tab, icon: '➕', label: 'Новый', badge: 0, blink: false }, { key: 'shift' as Tab, icon: '📊', label: 'Смена', badge: shiftValid.length, blink: false }].map(({ key, icon, label, badge, blink }) => {
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)} title={label} aria-label={label} className={blink ? 'uk-blink' : undefined} style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', cursor: 'pointer', border: active ? 'none' : '1.5px solid #ece7e0', background: active ? PRIMARY : 'rgba(255,255,255,.92)', boxShadow: active ? '0 4px 14px rgba(212,97,58,.4)' : '0 2px 8px rgba(0,0,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, transform: active ? 'scale(1.08)' : 'none' }}>
              <span>{icon}</span>
              {badge > 0 && <span style={{ position: 'absolute', top: -3, right: -3, background: blink ? '#c1121c' : (active ? '#fff' : PRIMARY), color: blink ? '#fff' : (active ? PRIMARY : '#fff'), fontSize: 11, fontWeight: 800, padding: '1px 5px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>{badge}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
