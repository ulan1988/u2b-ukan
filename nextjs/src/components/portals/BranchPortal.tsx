'use client'
// Портал филиала — портирован из Улкана 1:1. Вкладки Входящие/Исходящие/Новый/Финансы,
// карточки (позиции/история/чат), действия филиала (Принял/К логисту/Вернуть),
// правка кол-ва, добавление из каталога (NomPicker). Адаптировано под модель u2b.
import { useState, useEffect, useCallback, useRef } from 'react'
import { cardProgress } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import DateFilter, { inPeriod, type Period } from '@/components/DateFilter'
import NomPicker, { type PickedPos } from '@/components/NomPicker'
import FinanceView from '@/components/portals/FinanceView'
import ChatWidget from '@/components/ChatWidget'
import AppBadge from '@/components/AppBadge'
import PushSetup from '@/components/PushSetup'
import { branchOrders, orderAction, createClientOrder, getCard, updatePosition, addPosition, listMessages, sendMessage } from '@/lib/api/orders'
import { logout } from '@/lib/api/auth'
import { useLiveData } from '@/lib/live'
import { productionCalc, SHEET_WIDTH_CM } from '@/lib/production'

const PRIMARY = '#d4613a', BG = '#f1efec'
type Tab = 'in' | 'production' | 'produce' | 'out' | 'new' | 'finance'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    'В работе': { bg: '#fff0ea', color: '#c0532a' }, 'В ожидании': { bg: '#eef2ff', color: '#4a5aaa' }, 'В обработке': { bg: '#fff0ea', color: '#c0532a' },
    'В пути': { bg: '#fdf8e1', color: '#8a6f00' }, 'Доставлено': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Принято филиалом': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Архив': { bg: '#efece8', color: '#6b655b' },
  }
  const s = map[status] || { bg: '#efece8', color: '#6b655b' }
  return <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: s.bg, color: s.color }}>{status}</span>
}
const barColor = (pct: number) => pct >= 100 ? '#3a9d6e' : pct >= 60 ? '#c4a832' : PRIMARY
const fmtDate = (d?: string | null) => !d ? '—' : new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
const fmtTime = (d?: string | null) => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' · ' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }

export default function BranchPortal({ user }: { user: { id: string; name: string; orgId: string } }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('in')
  const [toast, setToast] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'positions' | 'history' | 'chat'>('positions')
  const [details, setDetails] = useState<Record<string, any>>({})
  const [editQty, setEditQty] = useState<Record<string, string>>({}); const [addCatalogFor, setAddCatalogFor] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [newTo, setNewTo] = useState(''); const [newText, setNewText] = useState(''); const [newLoading, setNewLoading] = useState(false); const [newDone, setNewDone] = useState<any>(null)
  const [catalogPos, setCatalogPos] = useState<PickedPos[]>([]); const [showCatalog, setShowCatalog] = useState(false)
  const [period, setPeriod] = useState<Period>('all'); const [day, setDay] = useState('')
  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => { setLoading(true); setOrders(await branchOrders()); setLoading(false) }, [])
  const pausedRef = useRef(false); pausedRef.current = addCatalogFor !== null || Object.keys(editQty).length > 0 || (selected !== null && detailTab === 'chat')
  useLiveData(() => { if (!pausedRef.current) load() }, [])
  useEffect(() => { setSelected(null); setDetailTab('positions') }, [tab])

  const inDate = (o: any) => inPeriod(o.createdAt, period, day)
  // Заказ на производство: карточка с позицией плеча-1 (филиал = изготовитель/поставщик), ещё не переданная логисту.
  const isProd = (o: any) => (o.positions || []).some((p: any) => Number(p.leg) === 1)
  const notForwarded = (o: any) => !['outgoing', 'accounting', 'bookkeeping', 'archive'].includes(o.screen)
  // Заказы на производство — плечо-1, ещё НЕ принято филиалом (очередь на принятие).
  const production = orders.filter(o => isProd(o) && !o.isCancelled && notForwarded(o) && o.status !== 'Принято филиалом' && inDate(o))
  // Производство — принято филиалом, идёт изготовление (тут расчёт материала).
  const producing = orders.filter(o => isProd(o) && !o.isCancelled && notForwarded(o) && o.status === 'Принято филиалом' && inDate(o))
  const incoming = orders.filter(o => ['incoming', 'reception'].includes(o.screen) && !o.isCancelled && !isProd(o) && inDate(o))
  const outgoing = orders.filter(o => ['outgoing', 'accounting', 'bookkeeping'].includes(o.screen) && !o.isCancelled && inDate(o))
  // Бейдж PWA: входящие + заказы на производство + производство (без фильтра по дате).
  const badgeCount = orders.filter(o => !o.isCancelled && ((isProd(o) && notForwarded(o)) || ['incoming', 'reception'].includes(o.screen))).length

  async function openOrder(id: string) {
    if (selected === id) { setSelected(null); return }
    setSelected(id); setDetailTab('positions')
    if (!details[id]) { const c: any = await getCard(id); if (c) setDetails(prev => ({ ...prev, [id]: c })) }
  }
  const refreshDetail = async (id: string) => { const c: any = await getCard(id); if (c) setDetails(prev => ({ ...prev, [id]: c })) }

  async function act(id: string, action: string, okMsg: string) {
    try {
      const r = await orderAction(id, action)
      if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось выполнить')); return }
      await load(); await refreshDetail(id); showMsg(okMsg)
    } catch { showMsg('⚠ Ошибка сети') }
  }
  async function saveQty(orderId: string, posId: string, qty: string) { await updatePosition(orderId, posId, { qty: Number(qty.replace(',', '.')) || 0 }); setEditQty(prev => { const n = { ...prev }; delete n[posId]; return n }); await refreshDetail(orderId); showMsg('✓ Количество изменено') }
  async function addToOrder(orderId: string, items: PickedPos[]) { setAddCatalogFor(null); if (!items.length) return; for (const it of items) await addPosition(orderId, { name1c: it.name1c || '', oral: it.oral, qty: it.qty, unit: it.unit, supplierId: undefined }); await refreshDetail(orderId); showMsg(`✓ Добавлено: ${items.length}`) }
  async function sendChat(orderId: string) { const t = msg.trim(); if (!t) return; setMsg(''); await sendMessage(orderId, t); const m = await listMessages(orderId); setDetails(prev => ({ ...prev, [orderId]: { ...prev[orderId], messages: m } })) }
  async function openChat(orderId: string) { const m = await listMessages(orderId); setDetails(prev => ({ ...prev, [orderId]: { ...prev[orderId], messages: m } })) }

  async function handleNewOrder(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newText.trim() && catalogPos.length === 0) { showMsg('Выберите товары из каталога или опишите заявку'); return }
    setNewLoading(true)
    try {
      const positions = catalogPos.map(p => ({ name1c: p.name1c || p.oral, oral: p.oral, qty: p.qty, unit: p.unit }))
      const r = await createClientOrder({ comment: newText, positions })
      if (r.ok) { setNewDone({ id: r.data.id }); setNewTo(''); setNewText(''); setCatalogPos([]); load() }
      else showMsg('⚠ ' + (r.error || 'Не удалось отправить заявку'))
    } catch { showMsg('⚠ Ошибка сети — попробуйте ещё раз') }
    finally { setNewLoading(false) }
  }

  const INP: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

  function OrderCard({ o, showActions }: { o: any; showActions: boolean }) {
    const pct = cardProgress(o); const isOpen = selected === o.id; const d = details[o.id]
    const positions = d?.positions || o.positions || []; const hist = d?.history || []; const chat = d?.messages
    const canEdit = !o.isCancelled && o.status !== 'Доставлено' && o.status !== 'Архив'
    return (
      <div style={{ background: '#fff', borderRadius: 14, marginBottom: 10, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => openOrder(o.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: PRIMARY }}>{o.id}</span><StatusBadge status={o.status} /></div>
            <span style={{ fontSize: 12, color: '#5f5952', flexShrink: 0 }}>{fmtDate(o.createdAt)}</span>
          </div>
          <div style={{ fontSize: 14, marginBottom: 8 }}><strong>{o.fromName || 'не распределено'}</strong>{o.deadline && <span style={{ color: '#5f5952', fontSize: 13, marginLeft: 8 }}>до {fmtDate(o.deadline)}</span>}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 5, background: '#f1efec', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 3, transition: 'width .3s' }} /></div><span style={{ fontSize: 13, fontWeight: 700, color: barColor(pct), minWidth: 36, textAlign: 'right' }}>{pct}%</span></div>
        </div>
        {isOpen && (
          <div style={{ borderTop: '1px solid #f1efec' }}>
            {showActions && (
              <div style={{ padding: '12px 16px', background: '#f8f6f3', borderBottom: '1px solid #f1efec', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {o.status !== 'Принято филиалом' && <button onClick={() => act(o.id, 'branchAccept', '✓ Принято — передайте логисту')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid #b8e0c8', background: '#e8f5ee', color: '#2e8a5e', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>✓ Принял</button>}
                {o.status === 'Принято филиалом' && <button onClick={() => act(o.id, 'branchForward', '✓ Передано логисту')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>К логисту →</button>}
                {o.screen === 'outgoing' && <button onClick={() => act(o.id, 'branchRecall', '✓ Возвращена')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid #e6c9b8', background: '#fff0ea', color: '#c0532a', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>← Вернуть</button>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0' }}>
              {(['positions', 'history', 'chat'] as const).map(t => <button key={t} onClick={() => { setDetailTab(t); if (t === 'chat' && chat === undefined) openChat(o.id) }} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: detailTab === t ? PRIMARY : '#f1efec', color: detailTab === t ? '#fff' : '#5f5952' }}>{t === 'positions' ? `Позиции (${positions.length})` : t === 'history' ? 'История' : '💬 Чат'}</button>)}
            </div>
            {detailTab === 'positions' && (
              <div style={{ padding: '10px 16px' }} onClick={e => e.stopPropagation()}>
                {positions.length === 0 ? <div style={{ fontSize: 14, color: '#5f5952', padding: '8px 0' }}>Нет позиций</div>
                  : positions.map((p: any) => {
                    const q = editQty[p.id]; const changed = q !== undefined && q !== String(Number(p.qty)); const editable = canEdit && p.status !== 'Доставлено'
                    return (
                      <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f8f6f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><RalDot code={extractRal(p.name1c || p.oral)} size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name1c || p.oral || '—'}</span></div></div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                          {editable ? <><input value={q ?? String(Number(p.qty))} inputMode="decimal" onChange={e => setEditQty(prev => ({ ...prev, [p.id]: e.target.value.replace(/[^0-9.,]/g, '') }))} style={{ width: 52, padding: '4px 6px', borderRadius: 6, border: `1.5px solid ${changed ? PRIMARY : '#e6e2dc'}`, fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }} /><span style={{ fontSize: 13, color: '#5f5952' }}>{p.unit}</span>{changed && <button onClick={() => saveQty(o.id, p.id, q)} style={{ border: 'none', background: PRIMARY, color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>}</> : <span style={{ fontSize: 13, color: '#5f5952' }}>{Number(p.qty)} {p.unit}</span>}
                          <StatusBadge status={p.status} />
                        </div>
                      </div>
                    )
                  })}
                {canEdit && <button onClick={() => setAddCatalogFor(o.id)} style={{ marginTop: 10, width: '100%', padding: '9px', border: '1.5px dashed #d8d3cc', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 14, color: '#5f5952', fontFamily: 'inherit', fontWeight: 600 }}>＋ Добавить позицию</button>}
              </div>
            )}
            {detailTab === 'history' && <div style={{ padding: '10px 16px' }}>{hist.length === 0 ? <div style={{ fontSize: 14, color: '#5f5952', padding: '8px 0' }}>Нет истории</div> : hist.map((h: any) => <div key={h.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8f6f3', alignItems: 'flex-start' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e6e2dc', marginTop: 6, flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 14 }}>{h.detail || h.action}</div><div style={{ fontSize: 12, color: '#5f5952' }}>{h.userName} · {fmtTime(h.createdAt)}</div></div></div>)}</div>}
            {detailTab === 'chat' && (
              <div style={{ padding: '10px 16px' }} onClick={e => e.stopPropagation()}>
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>{(chat || []).length === 0 ? <div style={{ color: '#837c72', fontSize: 13 }}>Сообщений нет</div> : chat.map((m: any) => <div key={m.id} style={{ background: '#f8f6f3', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}><b style={{ color: PRIMARY }}>{m.userName}</b>: {m.text}</div>)}</div>
                <div style={{ display: 'flex', gap: 6 }}><input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat(o.id)} placeholder="Сообщение…" style={{ ...INP, padding: '8px 10px' }} /><button onClick={() => sendChat(o.id)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>▶</button></div>
              </div>
            )}
            <div style={{ padding: '10px 16px 14px' }}><a href={`/track?id=${encodeURIComponent(o.id)}`} target="_blank" rel="noreferrer" style={{ color: PRIMARY, fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>Трекинг →</a></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Golos Text', system-ui, sans-serif", maxWidth: 480, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, whiteSpace: 'nowrap' }}>{toast}</div>}
      {addCatalogFor && <NomPicker onPick={items => addToOrder(addCatalogFor, items)} onClose={() => setAddCatalogFor(null)} />}

      <div style={{ background: '#211f1c', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="U2B" style={{ width: 42, height: 42, borderRadius: 10, display: 'block' }} />
          <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>U2B · Филиал</div><div style={{ color: '#8c857a', fontSize: 12 }}>{user.name}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={load} style={{ background: 'none', border: 'none', color: '#8c857a', fontSize: 18, cursor: 'pointer', padding: 4 }}>⟳</button><button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: 'none', border: '1px solid #444', color: '#ccc', fontSize: 13, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Выйти</button></div>
      </div>

      <div style={{ padding: '16px 62px 40px 12px' }}>
        {loading && orders.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div>}
        {tab === 'in' && <div><DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />{incoming.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>📥</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет входящих</div></div> : incoming.map(o => <OrderCard key={o.id} o={o} showActions={true} />)}</div>}
        {tab === 'production' && <div>
          <div style={{ background: '#f3eeff', color: '#7a3aaa', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>📋 Новые заказы через плечо. Нажми «Принял» — заказ уйдёт в «Производство».</div>
          <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
          {production.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>📋</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет заказов на производство</div></div> : production.map(o => <OrderCard key={o.id} o={o} showActions={true} />)}
        </div>}
        {tab === 'produce' && <div>
          <div style={{ background: '#e8f5ee', color: '#2e8a5e', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>🔧 Мастер-стол: 1 лист = {SHEET_WIDTH_CM} см (режем по ширине). Материала нужно = см изделий ÷ {SHEET_WIDTH_CM}.</div>
          <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
          {producing.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>🔧</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет заказов в производстве</div><div style={{ fontSize: 13, color: '#5f5952' }}>Прими заказ во вкладке «Заказы на производство».</div></div>
            : producing.map(o => {
              const cm = (o.positions || []).reduce((s: number, p: any) => s + (String(p.unit || '').includes('см') ? Number(p.qty) || 0 : 0), 0)
              const calc = productionCalc([{ cm }])
              return (
                <div key={o.id}>
                  {cm > 0 && <div style={{ background: '#fff', border: '1.5px solid #cfeadd', borderRadius: '10px 10px 0 0', padding: '8px 14px', fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: -6 }}>📐 Изделий: <b>{cm} см</b><span>→ материала ~<b style={{ color: '#2e8a5e' }}>{calc.sheets.toFixed(2)}</b> листа (целых {calc.sheetsCeil})</span></div>}
                  <OrderCard o={o} showActions={true} />
                </div>
              )
            })}
        </div>}
        {tab === 'out' && <div><DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />{outgoing.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>📤</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет исходящих</div></div> : outgoing.map(o => <OrderCard key={o.id} o={o} showActions={false} />)}</div>}
        {tab === 'new' && (
          <div>
            {newDone ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: 32, boxShadow: '0 0 0 1px #e6e2dc', textAlign: 'center' }}><div style={{ fontSize: 40, marginBottom: 12 }}>✅</div><div style={{ fontWeight: 700, fontSize: 20, color: '#2e8a5e', marginBottom: 8 }}>Заявка {newDone.id} создана!</div><button onClick={() => { setNewDone(null); setTab('in') }} style={{ marginTop: 8, padding: '10px 20px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← К заявкам</button></div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 0 0 1px #e6e2dc' }}>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Новая заявка</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 8, display: 'block' }}>ТОВАРЫ ИЗ КАТАЛОГА{catalogPos.length ? ` · ${catalogPos.length}` : ''}</label>
                    {catalogPos.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>{catalogPos.map((p, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8f6f3', borderRadius: 8, padding: '8px 10px' }}><RalDot code={extractRal(p.name1c || p.oral)} /><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name1c || p.oral}</span><span style={{ fontSize: 13, color: '#5f5952', flexShrink: 0, fontWeight: 600 }}>{p.qty} {p.unit}</span><button type="button" onClick={() => setCatalogPos(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button></div>)}</div>}
                    <button type="button" onClick={() => setShowCatalog(true)} style={{ width: '100%', padding: '13px', border: `1.5px ${catalogPos.length ? 'solid' : 'dashed'} ${PRIMARY}`, background: catalogPos.length ? '#fff' : '#fff8f5', color: PRIMARY, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>📖 {catalogPos.length ? 'Добавить ещё товар' : 'Выбрать товары из каталога'}</button>
                  </div>
                  <div><label style={{ fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }}>КОММЕНТАРИЙ</label><textarea style={{ ...INP, minHeight: 70, resize: 'vertical' }} value={newText} onChange={e => setNewText(e.target.value)} placeholder="Уточнения — или опишите заявку словами" /></div>
                  <button type="button" onClick={() => handleNewOrder()} disabled={newLoading} style={{ padding: '13px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', opacity: newLoading ? 0.6 : 1 }}>{newLoading ? 'Отправка...' : 'ОТПРАВИТЬ ЗАЯВКУ →'}</button>
                </div>
                {showCatalog && <NomPicker onPick={items => setCatalogPos(prev => [...prev, ...items])} onClose={() => setShowCatalog(false)} />}
              </div>
            )}
          </div>
        )}
        {tab === 'finance' && <FinanceView />}
      </div>

      <div style={{ position: 'fixed', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[{ key: 'in' as Tab, icon: '📥', label: 'Входящие', badge: incoming.length }, { key: 'production' as Tab, icon: '📋', label: 'Заказы на производство', badge: production.length }, { key: 'produce' as Tab, icon: '🛠️', label: 'Производство', badge: producing.length }, { key: 'out' as Tab, icon: '📤', label: 'Исходящие', badge: outgoing.length }, { key: 'new' as Tab, icon: '➕', label: 'Новый', badge: 0 }, { key: 'finance' as Tab, icon: '💰', label: 'Финансы', badge: 0 }].map(({ key, icon, label, badge }) => {
          const active = tab === key
          return <button key={key} onClick={() => setTab(key)} title={label} style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', cursor: 'pointer', border: active ? 'none' : '1.5px solid #ece7e0', background: active ? PRIMARY : 'rgba(255,255,255,.92)', boxShadow: active ? '0 4px 14px rgba(212,97,58,.4)' : '0 2px 8px rgba(0,0,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, transform: active ? 'scale(1.08)' : 'none' }}><span>{icon}</span>{badge > 0 && <span style={{ position: 'absolute', top: -3, right: -3, background: active ? '#fff' : PRIMARY, color: active ? PRIMARY : '#fff', fontSize: 11, fontWeight: 800, padding: '1px 5px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>{badge}</span>}</button>
        })}
      </div>
      <ChatWidget myId={user.id} orgId={user.orgId} bottomOffset={16} />
      <AppBadge count={badgeCount} baseTitle="Филиал · U2B" />
      <PushSetup />
    </div>
  )
}
