'use client'
// Кабинет заказчика — портирован из Улкана 1:1. Вкладки: Мои заявки / Новая заявка /
// 💰 Финансы / Уведомления. Правка кол-ва, добавление из каталога (NomPicker), чат.
import { useState, useEffect, useCallback, useRef } from 'react'
import { COLORS } from '@/lib/colors'
import { cardProgress } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import DateFilter, { inPeriod, type Period } from '@/components/DateFilter'
import NomPicker, { type PickedPos } from '@/components/NomPicker'
import ChatWidget from '@/components/ChatWidget'
import AppBadge from '@/components/AppBadge'
import PushSetup from '@/components/PushSetup'
import FinanceView from '@/components/portals/FinanceView'
import { clientOrders, createClientOrder, updatePosition, addPosition, listMessages, sendMessage, clientDocs, acceptClientDoc } from '@/lib/api/orders'
import { listNotifications, markRead } from '@/lib/api/notifications'
import { logout } from '@/lib/api/auth'
import { useLiveData } from '@/lib/live'

const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2300); return () => clearTimeout(t) }, [onClose])
  return <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, whiteSpace: 'nowrap' }}>{msg}</div>
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    'В ожидании': { bg: '#eef2ff', color: '#4a5aaa' }, 'Принят': { bg: '#fff0ea', color: '#c0532a' }, 'В обработке': { bg: '#fff0ea', color: '#c0532a' }, 'В работе': { bg: '#fff0ea', color: '#c0532a' },
    'В пути': { bg: '#fdf8e1', color: '#8a6f00' }, 'Доставлено': { bg: '#e8f5ee', color: '#2e8a5e' }, 'К учёту': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Проведён': { bg: '#e8f5ee', color: '#2e8a5e' },
    'Отменён': { bg: '#faeaea', color: '#b03020' }, 'Архив': { bg: '#eef2ff', color: '#4a5aaa' },
  }
  const s = map[status] || { bg: '#efece8', color: '#6b655b' }
  return <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, fontWeight: 600, background: s.bg, color: s.color }}>{status}</span>
}
const barColor = (pct: number) => pct >= 100 ? '#3a9d6e' : pct >= 60 ? '#c4a832' : '#d4613a'
const PRIMARY = '#d4613a'

// Ярлык документа с точки зрения контрагента.
function docLabel(type: string): { text: string; bg: string; color: string } {
  switch (type) {
    case 'sale': return { text: 'Покупка у нас', bg: '#fff0ea', color: '#c0532a' }
    case 'purchase': return { text: 'Ваша поставка нам', bg: '#e8f5ee', color: '#2e8a5e' }
    case 'return_in': return { text: '↩ Вы вернули нам', bg: '#faeaea', color: '#b03020' }
    case 'return_out': return { text: '↩ Мы вернули вам', bg: '#faeaea', color: '#b03020' }
    default: return { text: type, bg: '#efece8', color: '#6b655b' }
  }
}
const fmtSum = (n: any) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0))

// Список накладных/возвратов контрагента с кнопкой «Принять».
function DocList({ list, loading, emptyIcon, emptyText, onAccept }: { list: any[]; loading: boolean; emptyIcon: string; emptyText: string; onAccept: (id: string) => void }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div>
  if (!list.length) return <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 8 }}>{emptyIcon}</div><div style={{ color: '#5f5952' }}>{emptyText}</div></div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {list.map(d => {
        const lb = docLabel(d.type)
        const cancelled = d.status === 'cancelled'
        return (
          <div key={d.id} style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', boxShadow: '0 0 0 1px #e6e2dc', opacity: cancelled ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14, color: PRIMARY }}>{d.number}</span>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, fontWeight: 600, background: lb.bg, color: lb.color }}>{lb.text}</span>
              {cancelled && <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, fontWeight: 600, background: '#faeaea', color: '#b03020' }}>Отменён</span>}
              <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800 }}>{fmtSum(d.total)} ₸</span>
            </div>
            {d.items && <div style={{ fontSize: 13, color: '#5f5952', marginTop: 8, lineHeight: 1.5 }}>{d.items}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <span style={{ fontSize: 13, color: '#837c72' }}>{fmtDate(d.date)}</span>
              <div style={{ marginLeft: 'auto' }}>
                {cancelled ? null : d.contragentAccepted
                  ? <span style={{ fontSize: 13, fontWeight: 700, color: '#2e8a5e' }}>✓ Принято</span>
                  : <button onClick={() => onAccept(d.id)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2e8a5e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>✓ Принять</button>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
const fmtDate = (d?: string | null) => !d ? '—' : new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
const fmtDateTime = (d?: string) => { if (!d) return '—'; const dt = new Date(d), diff = Math.floor((Date.now() - dt.getTime()) / 60000); if (diff < 1) return 'только что'; if (diff < 60) return `${diff} мин`; if (diff < 1440) return `${Math.floor(diff / 60)} ч`; return fmtDate(d) }

export default function ClientApp({ user, viewAs }: { user: { id: string; name: string; orgId: string; slug?: string }; viewAs?: boolean }) {
  const [orders, setOrders] = useState<any[]>([])
  const [docs, setDocs] = useState<{ purchases: any[]; sales: any[]; returns: any[] }>({ purchases: [], sales: [], returns: [] })
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'orders' | 'buy' | 'sell' | 'return' | 'new' | 'notifications' | 'finance'>('orders')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [newText, setNewText] = useState(''); const [newDeadline, setNewDeadline] = useState(''); const [newLoading, setNewLoading] = useState(false)
  const [newResult, setNewResult] = useState<any>(null)
  const [catalogPos, setCatalogPos] = useState<PickedPos[]>([]); const [showCatalog, setShowCatalog] = useState(false)
  const [period, setPeriod] = useState<Period>('all'); const [day, setDay] = useState('')
  const [editQty, setEditQty] = useState<Record<string, string>>({}); const [addCatalogFor, setAddCatalogFor] = useState<string | null>(null); const [savingPos, setSavingPos] = useState(false)
  const [chat, setChat] = useState<Record<string, any[]>>({}); const [msg, setMsg] = useState('')

  const didInit = useRef(false)
  const load = useCallback(async () => {
    if (!didInit.current) setLoading(true)
    const uid = viewAs ? user.id : undefined
    const [ord, dcs, notifs] = await Promise.all([clientOrders(uid), clientDocs(uid), viewAs ? Promise.resolve([]) : listNotifications()])
    setOrders(ord); setDocs(dcs || { purchases: [], sales: [], returns: [] }); setNotifications(notifs as any); didInit.current = true; setLoading(false)
  }, [viewAs, user.id])

  async function acceptDoc(id: string) {
    const r: any = await acceptClientDoc(id, viewAs ? user.id : undefined)
    if (r?.ok) { setToast('✓ Принято'); await load() } else setToast('⚠ ' + (r?.error || 'Не удалось принять'))
  }
  const pausedRef = useRef(false); pausedRef.current = (tab === 'new' && !newResult) || addCatalogFor !== null || Object.keys(editQty).length > 0
  useLiveData(() => { if (!pausedRef.current) load() }, [])
  useEffect(() => { if (tab === 'new') setNewDeadline(d => d || todayLocal()) }, [tab])

  const unread = notifications.filter(n => !n.read).length
  const myOrders = orders.filter(o => inPeriod(o.createdAt, period, day))
  const pendingReturns = docs.returns.filter(d => !d.contragentAccepted && d.status !== 'cancelled').length
  const NAV: { key: typeof tab; icon: string; label: string; badge: number; blink?: boolean }[] = [
    { key: 'orders', icon: '📦', label: 'Заявки', badge: myOrders.length },
    { key: 'buy', icon: '🛒', label: 'Покупки', badge: docs.purchases.length },
    { key: 'sell', icon: '💰', label: 'Продажа', badge: docs.sales.length },
    { key: 'return', icon: '↩', label: 'Возврат', badge: pendingReturns, blink: pendingReturns > 0 },
    { key: 'new', icon: '➕', label: 'Новая', badge: 0 },
    { key: 'finance', icon: '💹', label: 'Финансы', badge: 0 },
    { key: 'notifications', icon: '🔔', label: 'Уведомления', badge: unread, blink: unread > 0 },
  ]

  async function saveQty(orderId: string, posId: string, qty: string) {
    setSavingPos(true); await updatePosition(orderId, posId, { qty: Number(qty.replace(',', '.')) || 0 })
    setEditQty(prev => { const n = { ...prev }; delete n[posId]; return n }); await load(); setToast('✓ Количество изменено'); setSavingPos(false)
  }
  async function addToOrder(orderId: string, items: PickedPos[]) {
    setAddCatalogFor(null); if (!items.length) return
    for (const it of items) await addPosition(orderId, { name1c: it.name1c || '', oral: it.oral, qty: it.qty, unit: it.unit })
    await load(); setToast(`✓ Добавлено: ${items.length}`)
  }
  async function handleNewOrder(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newText.trim() && catalogPos.length === 0) { setToast('Опишите заявку или соберите по каталогу'); return }
    setNewLoading(true)
    try {
      const positions = catalogPos.map(p => ({ name1c: p.name1c || p.oral, oral: p.oral, qty: p.qty, unit: p.unit }))
      const r = await createClientOrder({ comment: newText, positions })
      if (r.ok) { setNewResult({ id: r.data.id, trackingUrl: `/track?id=${encodeURIComponent(r.data.id)}` }); setNewText(''); setCatalogPos([]); load() }
      else setToast('⚠ ' + (r.error || 'Не удалось отправить заявку'))
    } catch { setToast('⚠ Ошибка сети — попробуйте ещё раз') }
    finally { setNewLoading(false) }
  }
  async function openChat(cardId: string) { setChat(prev => ({ ...prev, [cardId]: [] })); setChat(prev => ({ ...prev })); const m = await listMessages(cardId); setChat(prev => ({ ...prev, [cardId]: m })) }
  async function sendChat(cardId: string) { const t = msg.trim(); if (!t) return; setMsg(''); await sendMessage(cardId, t); const m = await listMessages(cardId); setChat(prev => ({ ...prev, [cardId]: m })) }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ minHeight: '100vh', background: '#f1efec', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      {addCatalogFor && <NomPicker onPick={items => addToOrder(addCatalogFor, items)} onClose={() => setAddCatalogFor(null)} />}

      <div style={{ background: '#fff', borderBottom: '1px solid #e6e2dc', padding: '0 20px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', alignItems: 'center', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="U2B" style={{ width: 42, height: 42, borderRadius: 10, display: 'block' }} />
            <div><div style={{ fontWeight: 700, fontSize: 15 }}>{user.name}</div><div style={{ fontSize: 12, color: '#5f5952' }}>Кабинет заказчика{viewAs ? ' · просмотр (админ)' : ''}</div></div>
          </div>
          <button onClick={async () => { await logout(); location.href = '/login' }} style={{ marginLeft: 'auto', padding: '6px 14px', border: '1.5px solid #e6e2dc', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#5f5952', fontFamily: 'inherit' }}>Выйти</button>
        </div>
      </div>

      {/* Круглые кнопки навигации — как в кабинете логиста */}
      <div style={{ position: 'fixed', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {NAV.map(({ key, icon, label, badge, blink }) => {
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)} title={label} aria-label={label} className={blink ? 'uk-blink' : undefined} style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', cursor: 'pointer', border: active ? 'none' : '1.5px solid #ece7e0', background: active ? PRIMARY : 'rgba(255,255,255,.92)', boxShadow: active ? '0 4px 14px rgba(212,97,58,.4)' : '0 2px 8px rgba(0,0,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, transform: active ? 'scale(1.08)' : 'none' }}>
              <span>{icon}</span>
              {badge > 0 && <span style={{ position: 'absolute', top: -3, right: -3, background: blink ? '#c1121c' : (active ? '#fff' : PRIMARY), color: blink ? '#fff' : (active ? PRIMARY : '#fff'), fontSize: 11, fontWeight: 800, padding: '1px 5px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>{badge}</span>}
            </button>
          )
        })}
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 72px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{NAV.find(n => n.key === tab)?.icon} {tab === 'orders' ? 'Мои заявки' : tab === 'new' ? 'Новая заявка' : NAV.find(n => n.key === tab)?.label}</h2>
          <button onClick={load} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>⟳</button>
        </div>

        {tab === 'orders' && (
          <div className="anim-fade">
            <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
            {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div>
              : myOrders.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 12 }}>📦</div><div style={{ fontWeight: 600, marginBottom: 8 }}>Заявок пока нет</div><button onClick={() => setTab('new')} style={{ padding: '10px 20px', background: '#d4613a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Подать заявку</button></div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myOrders.map(o => {
                    const pct = cardProgress(o); const open = selectedId === o.id
                    const canEditCard = !o.isCancelled && o.status !== 'Доставлено' && o.status !== 'Архив'
                    return (
                      <div key={o.id} onClick={() => setSelectedId(open ? null : o.id)} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 0 0 1px #e6e2dc', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 14, color: '#d4613a' }}>{o.id}</span>
                          <StatusBadge status={o.status} />
                          {o.isChanged && <span style={{ fontSize: 12, background: '#fff0ea', color: '#c0532a', padding: '1px 8px', borderRadius: 20, fontWeight: 600 }}>ИЗМЕНЕНИЕ</span>}
                          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#5f5952' }}>{fmtDate(o.createdAt)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (o.positions || []).length > 0 ? 10 : 0 }}>
                          {o.deadline && <span style={{ fontSize: 13, color: '#5f5952' }}>до {fmtDate(o.deadline)}</span>}
                          <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: barColor(pct) }}>{pct}%</span>
                        </div>
                        {(o.positions || []).length > 0 && <div style={{ height: 4, background: '#f1efec', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), transition: 'width .3s', borderRadius: 4 }} /></div>}

                        {open && (
                          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1efec' }} onClick={e => e.stopPropagation()}>
                            {o.comment && <div style={{ fontSize: 14, color: '#5f5952', marginBottom: 10 }}>Комментарий: {o.comment}</div>}
                            {(o.positions || []).length > 0 && <>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 8 }}>ПОЗИЦИИ</div>
                              {o.positions.map((p: any) => {
                                const canEdit = canEditCard && p.status !== 'Доставлено'; const q = editQty[p.id]; const changed = q !== undefined && q !== String(p.qty)
                                return (
                                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1efec' }}>
                                    <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}><RalDot code={extractRal(p.name1c || p.oral)} size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name1c || p.oral}</span></span>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                      {canEdit ? <>
                                        <input value={q ?? String(Number(p.qty))} inputMode="decimal" onChange={e => setEditQty(prev => ({ ...prev, [p.id]: e.target.value.replace(/[^0-9.,]/g, '') }))} style={{ width: 52, padding: '4px 6px', borderRadius: 6, border: `1.5px solid ${changed ? '#d4613a' : '#e6e2dc'}`, fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }} />
                                        <span style={{ fontSize: 13, color: '#5f5952' }}>{p.unit}</span>
                                        {changed && <button onClick={() => saveQty(o.id, p.id, q)} disabled={savingPos} style={{ border: 'none', background: '#d4613a', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>}
                                      </> : <span style={{ fontSize: 13, color: '#5f5952' }}>{Number(p.qty)} {p.unit}</span>}
                                      <StatusBadge status={p.status} />
                                    </div>
                                  </div>
                                )
                              })}
                            </>}
                            {canEditCard && <button onClick={() => setAddCatalogFor(o.id)} style={{ marginTop: 10, width: '100%', padding: '10px', border: '1.5px dashed #d4613a', background: '#fff8f5', color: '#d4613a', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>＋ Добавить товар из каталога</button>}
                            <div style={{ marginTop: 12 }}><a href={`/track?id=${encodeURIComponent(o.id)}`} target="_blank" rel="noreferrer" style={{ color: '#d4613a', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>Открыть трекинг →</a></div>
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1efec' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 6 }}>💬 ЧАТ ПО ЗАКАЗУ</div>
                              {chat[o.id] === undefined ? <button onClick={() => openChat(o.id)} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Открыть чат</button> : <>
                                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>{chat[o.id].length === 0 ? <div style={{ color: '#837c72', fontSize: 13 }}>Сообщений нет</div> : chat[o.id].map((m: any) => <div key={m.id} style={{ background: '#f8f6f3', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}><b style={{ color: '#d4613a' }}>{m.userName}</b>: {m.text}</div>)}</div>
                                <div style={{ display: 'flex', gap: 6 }}><input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat(o.id)} placeholder="Сообщение…" style={{ ...inp, padding: '8px 10px' }} /><button onClick={() => sendChat(o.id)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#d4613a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>▶</button></div>
                              </>}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>}
          </div>
        )}

        {tab === 'buy' && <div className="anim-fade"><DocList list={docs.purchases} loading={loading} emptyIcon="🛒" emptyText="Покупок пока нет" onAccept={acceptDoc} /></div>}
        {tab === 'sell' && <div className="anim-fade"><DocList list={docs.sales} loading={loading} emptyIcon="💰" emptyText="Поставок пока нет" onAccept={acceptDoc} /></div>}
        {tab === 'return' && (
          <div className="anim-fade">
            {pendingReturns > 0 && <div style={{ background: '#fff8f5', border: '1.5px solid #f3c8b0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14, color: '#c0532a', fontWeight: 600 }}>↩ Есть возвраты, ожидающие вашего подтверждения: {pendingReturns}</div>}
            <DocList list={docs.returns} loading={loading} emptyIcon="↩" emptyText="Возвратов пока нет" onAccept={acceptDoc} />
          </div>
        )}

        {tab === 'new' && (
          <div className="anim-fade">
            {newResult ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: 32, boxShadow: '0 0 0 1px #e6e2dc', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#2e8a5e', marginBottom: 8 }}>Заявка {newResult.id} создана!</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  <button onClick={() => { setNewResult(null); setNewText(''); setNewDeadline(''); setCatalogPos([]); setTab('orders') }} style={{ padding: '10px 20px', background: '#fff', border: '1.5px solid #e6e2dc', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Мои заявки</button>
                  <a href={newResult.trackingUrl} target="_blank" rel="noreferrer" style={{ padding: '10px 20px', background: '#d4613a', color: '#fff', borderRadius: 8, fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>Отслеживать →</a>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 0 0 1px #e6e2dc', maxWidth: 560 }}>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Новая заявка</div>
                <div style={{ color: '#5f5952', fontSize: 14, marginBottom: 22 }}>Выберите товары из каталога или опишите словами — заявка уйдёт менеджеру</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 8, display: 'block', letterSpacing: '.03em' }}>ТОВАРЫ ИЗ КАТАЛОГА{catalogPos.length ? ` · ${catalogPos.length}` : ''}</label>
                    {catalogPos.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>{catalogPos.map((p, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8f6f3', borderRadius: 8, padding: '8px 10px' }}><RalDot code={extractRal(p.name1c || p.oral)} /><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name1c || p.oral}</span><span style={{ fontSize: 13, color: '#5f5952', flexShrink: 0, fontWeight: 600 }}>{p.qty} {p.unit}</span><button type="button" onClick={() => setCatalogPos(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button></div>)}</div>}
                    <button type="button" onClick={() => setShowCatalog(true)} style={{ width: '100%', padding: '13px', border: `1.5px ${catalogPos.length ? 'solid' : 'dashed'} #d4613a`, background: catalogPos.length ? '#fff' : '#fff8f5', color: '#d4613a', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>📖 {catalogPos.length ? 'Добавить ещё товар' : 'Выбрать товары из каталога'}</button>
                  </div>
                  <div><label style={{ fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }}>КОММЕНТАРИЙ <span style={{ fontWeight: 400 }}>(необязательно)</span></label><textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={newText} onChange={e => setNewText(e.target.value)} placeholder="Уточнения, пожелания — или опишите заявку словами" /></div>
                  <div><label style={{ fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }}>ЖЕЛАЕМЫЙ СРОК</label><input style={inp} type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} /></div>
                  <button type="button" onClick={() => handleNewOrder()} disabled={newLoading} style={{ padding: '13px', background: '#d4613a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: newLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: newLoading ? 0.6 : 1 }}>{newLoading ? 'Отправка...' : catalogPos.length ? `ОТПРАВИТЬ ЗАЯВКУ · ${catalogPos.length} поз. →` : 'ОТПРАВИТЬ ЗАЯВКУ →'}</button>
                </div>
                {showCatalog && <NomPicker onPick={items => setCatalogPos(prev => [...prev, ...items])} onClose={() => setShowCatalog(false)} />}
              </div>
            )}
          </div>
        )}

        {tab === 'finance' && <FinanceView />}

        {tab === 'notifications' && (
          <div className="anim-fade">
            {notifications.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div><div style={{ color: '#5f5952' }}>Уведомлений пока нет</div></div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{notifications.map(n => <div key={n.id} onClick={() => { if (!n.read) { markRead(n.id); setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x)) } }} style={{ background: n.read ? '#fff' : '#fff8f5', borderRadius: 10, padding: '14px 18px', boxShadow: `0 0 0 1px ${n.read ? '#e6e2dc' : '#f3c8b0'}`, cursor: n.read ? 'default' : 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div style={{ fontSize: 14, fontWeight: n.read ? 400 : 600 }}>{n.text}</div>{!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d4613a', flexShrink: 0, marginTop: 3 }} />}</div><div style={{ fontSize: 12, color: '#5f5952', marginTop: 4 }}>{fmtDateTime(n.createdAt)}</div></div>)}</div>}
          </div>
        )}
      </div>
      <ChatWidget myId={user.id} orgId={user.orgId} bottomOffset={16} />
      <AppBadge count={unread} baseTitle="Мои заявки · U2B" />
      <PushSetup />
    </div>
  )
}
