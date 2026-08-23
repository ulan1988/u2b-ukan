'use client'
// Портал филиала — портирован из Улкана 1:1. Вкладки Входящие/Исходящие/Новый/Финансы,
// карточки (позиции/история/чат), действия филиала (Принял/К логисту/Вернуть),
// правка кол-ва, добавление из каталога (NomPicker). Адаптировано под модель u2b.
import { useState, useEffect, useCallback, useRef } from 'react'
import { cardProgress } from '@/lib/adminFmt'
import { RalDot, extractRal, ralOrdered } from '@/lib/ral'
import DateFilter, { inPeriod, type Period } from '@/components/DateFilter'
import NomPicker, { type PickedPos } from '@/components/NomPicker'
import FinanceView from '@/components/portals/FinanceView'
import ChatWidget from '@/components/ChatWidget'
import AppBadge from '@/components/AppBadge'
import PushSetup from '@/components/PushSetup'
import { branchOrders, orderAction, createClientOrder, getCard, updatePosition, addPosition, listMessages, sendMessage, sendOrder, splitCard, updateCard, payCard, unpostSale, produceToBase } from '@/lib/api/orders'
import { fetchRefs, listSpecProjects, carveToLogist, carveCard, sheetsByColor, takeSheet } from '@/lib/api/refs'
import { logout } from '@/lib/api/auth'
import { useLiveData } from '@/lib/live'
import ProductionWorkbench from '@/components/portals/ProductionWorkbench'
import SpecProjectWorkbench from '@/components/portals/SpecProjectWorkbench'

const PRIMARY = '#d4613a', BG = '#f1efec'
type Tab = 'production' | 'spec' | 'sheets' | 'produce' | 'out' | 'new' | 'finance'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    'В работе': { bg: '#fff0ea', color: '#c0532a' }, 'В ожидании': { bg: '#eef2ff', color: '#4a5aaa' }, 'В обработке': { bg: '#fff0ea', color: '#c0532a' },
    'В пути': { bg: '#fdf8e1', color: '#8a6f00' }, 'Доставлено': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Принято филиалом': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Архив': { bg: '#efece8', color: '#6b655b' },
    'К выполнению': { bg: '#f3eeff', color: '#7a3aaa' }, 'Выполнено': { bg: '#e8f5ee', color: '#2e8a5e' },
    'Производство': { bg: '#f3eeff', color: '#7a3aaa' }, 'Изготовлено': { bg: '#e8f5ee', color: '#2e8a5e' },
    'Распил': { bg: '#f3eeff', color: '#7a3aaa' }, 'Листогиб': { bg: '#e8f1ff', color: '#2a5aaa' },
    'Принял': { bg: '#f3eeff', color: '#7a3aaa' }, 'Готов к доставке': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Отправлено': { bg: '#e8f1ff', color: '#2a5aaa' },
  }
  const s = map[status] || { bg: '#efece8', color: '#6b655b' }
  return <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: s.bg, color: s.color }}>{status}</span>
}
const barColor = (pct: number) => pct >= 100 ? '#3a9d6e' : pct >= 60 ? '#c4a832' : PRIMARY
const fmtDate = (d?: string | null) => !d ? '—' : new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
const fmtTime = (d?: string | null) => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' · ' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }

export default function BranchPortal({ user }: { user: { id: string; name: string; orgId: string; slug?: string } }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('production')
  const [toast, setToast] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'positions' | 'history' | 'chat'>('positions')
  const [details, setDetails] = useState<Record<string, any>>({})
  const [editQty, setEditQty] = useState<Record<string, string>>({}); const [addCatalogFor, setAddCatalogFor] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [newTo, setNewTo] = useState(''); const [newText, setNewText] = useState(''); const [newLoading, setNewLoading] = useState(false); const [newDone, setNewDone] = useState<any>(null)
  const [catalogPos, setCatalogPos] = useState<PickedPos[]>([]); const [showCatalog, setShowCatalog] = useState(false)
  const [period, setPeriod] = useState<Period>('all'); const [day, setDay] = useState('')
  const [cags, setCags] = useState<any[]>([]); const [products, setProducts] = useState<any[]>([]); const [showDirect, setShowDirect] = useState(false)
  const [specProjects, setSpecProjects] = useState<any[]>([]); const [showSpecBuilder, setShowSpecBuilder] = useState(false); const [specQ, setSpecQ] = useState<Record<string, string>>({})
  const [carveFor, setCarveFor] = useState<string | null>(null)   // проект в режиме «Создать карточку»
  const [sheets, setSheets] = useState<any[]>([]); const [takeColor, setTakeColor] = useState(''); const [takeQty, setTakeQty] = useState('')
  const [drawerId, setDrawerId] = useState<string | null>(null)   // шторка позиций заказа мастера
  const [sel, setSel] = useState<Record<string, boolean>>({})     // выбор позиций в шторке для частичной отправки
  const [pay, setPay] = useState({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' })   // касса мастера
  const isZK = (o: any) => /^ЗК-/.test(o.id || '')
  const fmtCode = (id: string) => isZK({ id }) ? id.replace(/-/g, ' ') : id
  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }
  useEffect(() => { fetchRefs().then((r: any) => { setCags((r.contragents || []).filter((c: any) => !c.archived)); setProducts(r.products || []) }) }, [])

  // uid — если кабинет открыт админом «от имени» филиала, все запросы идут от этого филиала.
  const load = useCallback(async () => { setLoading(true); setOrders(await branchOrders(user.id)); setLoading(false) }, [user.id])
  // Пауза live-обновления пока идёт правка: каталог, правка кол-ва, чат, заполнение прямого
  // заказа мастера (showDirect) или открыта шторка — иначе перезагрузка списка сбрасывает ввод.
  const pausedRef = useRef(false); pausedRef.current = addCatalogFor !== null || Object.keys(editQty).length > 0 || (selected !== null && detailTab === 'chat') || showDirect || drawerId !== null || showSpecBuilder || carveFor !== null
  useLiveData(() => { if (!pausedRef.current) load() }, [])
  useEffect(() => { setSelected(null); setDetailTab('positions') }, [tab])

  // Спец-проекты мастера (очередь) — грузим при заходе на вкладку.
  const loadSpec = useCallback(async () => { setSpecProjects(await listSpecProjects(user.orgId)) }, [user.orgId])
  useEffect(() => { if (tab === 'spec') loadSpec() }, [tab, loadSpec])
  useEffect(() => { loadSpec() }, [loadSpec])   // проекты нужны и в «Прямом заказе» (фильтр по клиенту)
  // Список проектов нужен и в шторке (Ф-B: «Добавить в проект»); касса сбрасывается на новую карточку.
  useEffect(() => { if (drawerId) loadSpec(); setPay({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' }) }, [drawerId, loadSpec])
  // Вынести часть позиции спец-проекта → сразу к логисту (Исходящие), остаток вычитается.
  // Собрать введённые кол-ва проекта в строки (specItemId + qty).
  const carveLines = () => Object.entries(specQ).map(([specItemId, v]) => ({ specItemId, qty: Number(String(v).replace(',', '.')) || 0 })).filter(l => l.qty > 0)
  // «Создать карточку» из проекта → заявка в Приёмку (пойдёт по потоку производства). Остаток проекта уменьшается.
  async function doCarveCard(projectId: string) {
    const lines = carveLines(); if (!lines.length) { showMsg('Укажите количество'); return }
    const r: any = await carveCard(projectId, { lines, prod: true })
    if (r.ok) { showMsg(`✓ Карточка создана${r.data?.id ? ' ' + r.data.id : ''}`); setSpecQ({}); setCarveFor(null); await loadSpec(); await load() }
    else showMsg('⚠ ' + (r.error || 'Не удалось'))
  }
  async function doCarveLogist(projectId: string) {
    const lines = carveLines(); if (!lines.length) { showMsg('Укажите количество'); return }
    const r: any = await carveToLogist(projectId, lines)
    if (r.ok) { showMsg(`✓ Отправлено логисту${r.data?.id ? ' ' + r.data.id : ''}`); setSpecQ({}); setCarveFor(null); await loadSpec(); await load() }
    else showMsg('⚠ ' + (r.error || 'Не удалось'))
  }


  // Кабинет-передатчик листов: остатки по цветам + списание «взял N».
  const loadSheets = useCallback(async () => { setSheets(await sheetsByColor(user.orgId)) }, [user.orgId])
  useEffect(() => { if (tab === 'sheets') loadSheets() }, [tab, loadSheets])
  const sheetQtyOf = (code: string) => { const s = sheets.find((x: any) => (x.color || '') === code); return s ? Number(s.glyan) || 0 : 0 }
  async function takeLeaf() {
    const n = Number((takeQty || '').replace(',', '.')) || 0
    if (!takeColor || n <= 0) { showMsg('Выберите цвет и кол-во'); return }
    const r: any = await takeSheet(takeColor, n)
    if (r.ok) { showMsg(`− ${n} листов ${takeColor}${r.shortfall ? ` (не хватило ${r.shortfall})` : ''}`); setTakeColor(''); setTakeQty(''); await loadSheets() }
    else showMsg('⚠ ' + (r.error || 'Не удалось'))
  }

  const inDate = (o: any) => inPeriod(o.createdAt, period, day)
  // Заказ на производство: карточка с позицией плеча-1 (филиал = изготовитель/поставщик), ещё не переданная логисту.
  const isProd = (o: any) => (o.positions || []).some((p: any) => Number(p.leg) === 1)
  const notClosed = (o: any) => !['bookkeeping', 'archive'].includes(o.screen)
  // Этап мастера живёт в prodPhase: '' → accepted (Принял) → working (В работе) → ready (Готов к доставке) → sent (Отправлено).
  const phase = (o: any) => o.prodPhase || ''
  const custName = (o: any) => cags.find((c: any) => c.id === o.contactId)?.name || ''
  // База стола мастера: плечо-1 ИЛИ прямой заказ (ЗК), не отменён, не закрыт. Частично-отправленная
  // карточка (часть позиций уже у логиста, часть в работе) остаётся тут, пока есть leg=1.
  const prodBase = (o: any) => (isProd(o) || isZK(o)) && !o.isCancelled && notClosed(o)
  // Заказы на производство — плечо-1, ещё НЕ принятые мастером (prodPhase пуст). ЗК тут нет.
  const production = orders.filter(o => isProd(o) && !isZK(o) && !o.isCancelled && notClosed(o) && phase(o) === '' && inDate(o))
  // Стол мастера по этапам.
  const accepted = orders.filter(o => prodBase(o) && phase(o) === 'accepted' && inDate(o))
  const working = orders.filter(o => prodBase(o) && phase(o) === 'working' && inDate(o))
  const ready = orders.filter(o => prodBase(o) && phase(o) === 'ready' && inDate(o))
  const inWork = [...accepted, ...working, ...ready]
  // Продано мастером (проведена расходная) — по фазе sold, вне notClosed.
  const sold = orders.filter(o => (isProd(o) || isZK(o)) && !o.isCancelled && phase(o) === 'sold' && inDate(o)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const incoming = orders.filter(o => ['incoming', 'reception'].includes(o.screen) && !o.isCancelled && !isProd(o) && !isZK(o) && inDate(o))
  // Для филиала входящее = заказы на производство: объединяем в одну вкладку (без дубля «Входящие»).
  const prodQueue = [...production, ...incoming].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  // Исходящие филиала — только НЕ плечо-производство (leg 1). Полностью отправленная карточка (все
  // позиции → логисту, leg=2, screen=outgoing) сюда попадает; частично-отправленная — ещё в «Производстве».
  const outgoing = orders.filter(o => ['outgoing', 'accounting', 'bookkeeping'].includes(o.screen) && !o.isCancelled && !isProd(o) && inDate(o))
  // Бейдж PWA: входящие + заказы на производство + производство (без фильтра по дате).
  const badgeCount = orders.filter(o => !o.isCancelled && ((isProd(o) && notClosed(o)) || ['incoming', 'reception'].includes(o.screen))).length

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
  // Отправить логисту: целиком (posIds не задан) или частями (выбранные позиции).
  // Пока остаются leg=1 позиции — карточка остаётся у мастера; когда всё отправлено — уходит в Исходящие.
  async function sendCard(id: string, posIds?: string[]) {
    try {
      const r = await sendOrder(id, posIds); if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
      setSel({}); if (r.remaining && r.remaining > 0) { showMsg(`✓ Отправлено · осталось ${r.remaining}`); await refreshDetail(id) } else { setDrawerId(null); showMsg('✓ Отправлено логисту') }
      await load()
    } catch { showMsg('⚠ Ошибка сети') }
  }
  // Ф-B: действия карточки — проект, сплит (выбранные → новая карточка).
  async function attachProject(id: string, specProjectId: string) { const r = await updateCard(id, { specProjectId }); if (r.ok) { await refreshDetail(id); await load(); showMsg(specProjectId ? '📁 Добавлено в проект' : 'Отвязано от проекта') } else showMsg('⚠ Не удалось') }
  async function doSplit(id: string, posIds: string[]) {
    const r = await splitCard(id, posIds); if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
    setSel({}); setDrawerId(null); await load(); showMsg(`✓ Создана карточка ${r.id || ''}`)
  }
  // Касса: оплатить (продать) → расходная + оплаты; отменить продажу → сторно.
  async function doPay(id: string) {
    const body = { cash: Number((pay.cash || '').replace(',', '.')) || 0, kaspi: Number((pay.kaspi || '').replace(',', '.')) || 0, qr: Number((pay.qr || '').replace(',', '.')) || 0, change: Number((pay.change || '').replace(',', '.')) || 0, changeFrom: pay.changeFrom }
    const r = await payCard(id, body); if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
    setPay({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' }); setDrawerId(null); await load(); showMsg(`💵 Продано${r.number ? ` (${r.number})` : ''}${r.debt ? ` · долг ${r.debt}` : ''}`)
  }
  async function doUnpay(id: string) {
    if (!confirm('Отменить продажу? Документы будут сторнированы, карточка вернётся в работу.')) return
    const r = await unpostSale(id); if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
    await load(); showMsg('↩ Продажа отменена')
  }
  // Производство: внести изделия карточки в базу (создать товар + выпуск на склад).
  async function doToBase(id: string) {
    const r = await produceToBase(id); if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
    await refreshDetail(id); await load(); showMsg(`📦 Внесено в базу${r.produced ? ` · ${r.produced} изд.` : ''}`)
  }

  async function saveQty(orderId: string, posId: string, qty: string) { await updatePosition(orderId, posId, { qty: Number(qty.replace(',', '.')) || 0 }); setEditQty(prev => { const n = { ...prev }; delete n[posId]; return n }); await refreshDetail(orderId); showMsg('✓ Количество изменено') }
  async function addToOrder(orderId: string, items: PickedPos[]) { setAddCatalogFor(null); if (!items.length) return; for (const it of items) await addPosition(orderId, { name1c: it.name1c || '', oral: it.oral, qty: it.qty, unit: it.unit, widthCm: it.widthCm, supplierId: undefined }); await refreshDetail(orderId); showMsg(`✓ Добавлено: ${items.length}`) }
  async function sendChat(orderId: string) { const t = msg.trim(); if (!t) return; setMsg(''); await sendMessage(orderId, t); const m = await listMessages(orderId); setDetails(prev => ({ ...prev, [orderId]: { ...prev[orderId], messages: m } })) }
  async function openChat(orderId: string) { const m = await listMessages(orderId); setDetails(prev => ({ ...prev, [orderId]: { ...prev[orderId], messages: m } })) }

  async function handleNewOrder(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newText.trim() && catalogPos.length === 0) { showMsg('Выберите товары из каталога или опишите заявку'); return }
    setNewLoading(true)
    try {
      const positions = catalogPos.map(p => ({ name1c: p.name1c || p.oral, oral: p.oral, qty: p.qty, unit: p.unit, widthCm: p.widthCm }))
      const r = await createClientOrder({ comment: newText, positions }, user.id)
      if (r.ok) { setNewDone({ id: r.data.id }); setNewTo(''); setNewText(''); setCatalogPos([]); load() }
      else showMsg('⚠ ' + (r.error || 'Не удалось отправить заявку'))
    } catch { showMsg('⚠ Ошибка сети — попробуйте ещё раз') }
    finally { setNewLoading(false) }
  }

  const INP: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

  function OrderCard({ o, showActions, prodFlow }: { o: any; showActions: boolean; prodFlow?: boolean }) {
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
                {prodFlow ? (
                  <button onClick={() => act(o.id, 'produceAccept', '✓ Принял — на столе мастера')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#7a3aaa', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>✓ Принял</button>
                ) : (
                  <>
                    {o.status !== 'Принято филиалом' && <button onClick={() => act(o.id, 'branchAccept', '✓ Принято — передайте логисту')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid #b8e0c8', background: '#e8f5ee', color: '#2e8a5e', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>✓ Принял</button>}
                    {o.status === 'Принято филиалом' && <button onClick={() => act(o.id, 'branchForward', '✓ Передано логисту')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>К логисту →</button>}
                  </>
                )}
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
                          {p.widthCm != null && <span style={{ fontSize: 12, color: '#7a3aaa', fontWeight: 700, background: '#f3eeff', padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>📏 {Number(p.widthCm)} см</span>}
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

      {/* Шторка позиций карточки мастера: смена статуса + отправка логисту (целиком/частями) */}
      {drawerId && (() => {
        const o = (details[drawerId]?.positions ? details[drawerId] : orders.find(x => x.id === drawerId)); if (!o) return null
        const pos = o.positions || []
        const leg1 = pos.filter((p: any) => Number(p.leg) === 1)   // ещё у мастера, можно отправить
        const sent = pos.filter((p: any) => Number(p.leg) !== 1)   // уже у логиста
        const selIds = leg1.filter((p: any) => sel[p.id]).map((p: any) => p.id)
        const ph = phase(o)
        const total = pos.reduce((s: number, p: any) => s + Number(p.qty || 0) * Number(p.price || 0), 0)
        const isSold = ph === 'sold' || !!o.linkedDocId
        const needBase = pos.length > 0 && pos.some((p: any) => !p.productId)
        const cashN = Number((pay.cash || '').replace(',', '.')) || 0, kaspiN = Number((pay.kaspi || '').replace(',', '.')) || 0, qrN = Number((pay.qr || '').replace(',', '.')) || 0
        const debtN = Math.max(0, total - cashN - kaspiN - qrN)
        const fmtMoney = (n: number) => Math.round(n).toLocaleString('ru-RU')
        return (
          <div onClick={() => { setDrawerId(null); setSel({}) }} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.4)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(400px, 92vw)', height: '100%', background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#7a3aaa' }}>{fmtCode(o.id)}</span>
                <StatusBadge status={o.status} />
                <button onClick={() => { setDrawerId(null); setSel({}) }} style={{ marginLeft: 'auto', border: 'none', background: '#f1efec', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 15, color: '#5f5952' }}>✕</button>
              </div>
              {/* Смена статуса всей карточки */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1efec', display: 'flex', gap: 6 }}>
                {(['accepted', 'working', 'ready'] as const).map((k, i) => {
                  const label = ['Принял', 'В работе', 'Готов'][i]
                  const rank = { accepted: 0, working: 1, ready: 2 }
                  const cur = rank[ph as 'accepted' | 'working' | 'ready'] ?? -1
                  const on = cur >= i
                  const action = k === 'accepted' ? 'produceAccept' : k === 'working' ? 'produceStart' : 'produceReady'
                  return <button key={k} onClick={() => cur !== i && act(o.id, action, `✓ ${label}`)} style={{ flex: 1, padding: '8px 4px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: on ? PRIMARY : '#f1efec', color: on ? '#fff' : '#5f5952' }}>{label}</button>
                })}
              </div>
              {/* Ф-C: касса (нал/каспи/долг/сдача) + проект */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1efec', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {isSold ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2e8a5e' }}>💵 Продано · {fmtMoney(total)} ₸</span>
                    <span style={{ fontSize: 12, color: '#5f5952' }}>{o.payment || ''}{Number(o.paidCash) > 0 ? ` · нал ${fmtMoney(Number(o.paidCash))}` : ''}{Number(o.paidKaspi) > 0 ? ` · каспи ${fmtMoney(Number(o.paidKaspi))}` : ''}</span>
                    <button onClick={() => doUnpay(o.id)} style={{ marginLeft: 'auto', border: '1.5px solid #e6c9b8', background: '#fff', color: '#c0532a', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>↩ Отменить продажу</button>
                  </div>
                ) : (
                  <>
                    {needBase && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3eeff', borderRadius: 8, padding: '8px 10px' }}>
                        <span style={{ fontSize: 12.5, color: '#7a3aaa', flex: 1 }}>Изделия ещё не в базе (складе)</span>
                        <button onClick={() => doToBase(o.id)} style={{ border: 'none', background: '#7a3aaa', color: '#fff', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>📦 Внести в базу</button>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em' }}>КАССА</span>
                      <span style={{ fontSize: 13, color: '#5f5952' }}>сумма <b style={{ color: '#26231f' }}>{fmtMoney(total)}</b> ₸</span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: debtN > 0 ? '#c0532a' : '#2e8a5e' }}>долг {fmtMoney(debtN)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Наличка<input value={pay.cash} inputMode="decimal" onChange={e => setPay(p => ({ ...p, cash: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ width: '100%', padding: '8px 8px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 3 }} /></label>
                      <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Каспи<span style={{ color: '#b8b1a6' }}> (GOLD)</span><input value={pay.kaspi} inputMode="decimal" onChange={e => setPay(p => ({ ...p, kaspi: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ width: '100%', padding: '8px 8px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 3 }} /></label>
                      <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>QR<span style={{ color: '#b8b1a6' }}> (банк)</span><input value={pay.qr} inputMode="decimal" onChange={e => setPay(p => ({ ...p, qr: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ width: '100%', padding: '8px 8px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 3 }} /></label>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#5f5952' }}>Сдача</span>
                      <input value={pay.change} inputMode="decimal" onChange={e => setPay(p => ({ ...p, change: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ width: 80, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }} />
                      <span style={{ fontSize: 12, color: '#5f5952' }}>с</span>
                      {(['cash', 'kaspi'] as const).map(cf => { const on = pay.changeFrom === cf; return <button key={cf} onClick={() => setPay(p => ({ ...p, changeFrom: on ? '' : cf }))} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: on ? PRIMARY : '#f1efec', color: on ? '#fff' : '#5f5952' }}>{cf === 'cash' ? 'нал' : 'каспи'}</button> })}
                      <button onClick={() => doPay(o.id)} style={{ marginLeft: 'auto', border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>💵 Оплатить</button>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em', width: 54, flexShrink: 0 }}>📁</span>
                  <select value={o.specProjectId || ''} onChange={e => attachProject(o.id, e.target.value)} style={{ flex: 1, padding: '7px 8px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                    <option value="">— без проекта —</option>
                    {specProjects.map((sp: any) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '10px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em' }}>ЗАКАЗЧИК:</span>
                  <b>{custName(o) || '—'}</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em' }}>ПОЗИЦИИ · {pos.length}</span>
                  {leg1.length > 0 && <button onClick={() => setSel(selIds.length === leg1.length ? {} : Object.fromEntries(leg1.map((p: any) => [p.id, true])))} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: PRIMARY, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{selIds.length === leg1.length ? 'Снять всё' : 'Выбрать всё'}</button>}
                </div>
                {pos.length === 0 ? <div style={{ color: '#837c72', fontSize: 14, padding: 8 }}>Нет позиций</div>
                  : pos.map((p: any) => {
                    const isSent = Number(p.leg) !== 1
                    const on = !!sel[p.id]
                    return (
                      <div key={p.id} onClick={() => !isSent && setSel(s => ({ ...s, [p.id]: !s[p.id] }))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid #f6f3f0', cursor: isSent ? 'default' : 'pointer' }}>
                        {!isSent && <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: on ? 'none' : '1.5px solid #d8d3cc', background: on ? PRIMARY : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{on ? '✓' : ''}</span>}
                        <RalDot code={extractRal(p.name1c || p.oral)} size={14} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSent ? '#9a938a' : '#26231f' }}>{p.name1c || p.oral}</span>
                        {p.widthCm != null && <span style={{ fontSize: 11, color: '#7a3aaa', fontWeight: 700, background: '#f3eeff', padding: '1px 7px', borderRadius: 20, flexShrink: 0 }}>{Number(p.widthCm)} см</span>}
                        <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600, flexShrink: 0 }}>{Number(p.qty)} {p.unit}</span>
                        {isSent && <span style={{ fontSize: 12, color: '#2a5aaa', fontWeight: 700, flexShrink: 0 }}>🚚 у логиста</span>}
                      </div>
                    )
                  })}
                {leg1.length === 0 && sent.length > 0 && <div style={{ marginTop: 10, fontSize: 13, color: '#2e8a5e', fontWeight: 600 }}>✓ Все позиции отправлены логисту</div>}
              </div>
              {leg1.length > 0 && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f1efec', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selIds.length > 0 && selIds.length < pos.length && (
                    <button onClick={() => doSplit(o.id, selIds)} style={{ width: '100%', border: '1.5px solid #d8c4ec', background: '#f3eeff', color: '#7a3aaa', borderRadius: 9, padding: '10px', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>➕ Вынести в новую карточку ({selIds.length})</button>
                  )}
                  {selIds.length > 0 && selIds.length < leg1.length
                    ? <button onClick={() => sendCard(o.id, selIds)} style={{ width: '100%', border: 'none', background: PRIMARY, color: '#fff', borderRadius: 9, padding: '11px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>🚚 Отправить выбранные ({selIds.length}) →</button>
                    : <button onClick={() => sendCard(o.id)} style={{ width: '100%', border: 'none', background: PRIMARY, color: '#fff', borderRadius: 9, padding: '11px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>🚚 Отправить всё логисту ({leg1.length}) →</button>}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <div style={{ background: '#211f1c', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="U2B" style={{ width: 42, height: 42, borderRadius: 10, display: 'block' }} />
          <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>U2B · Филиал <span style={{ color: '#5a544c', fontSize: 10, fontWeight: 500 }}>v{process.env.NEXT_PUBLIC_BUILD_SHA}</span></div><div style={{ color: '#8c857a', fontSize: 12 }}>{user.name}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={load} style={{ background: 'none', border: 'none', color: '#8c857a', fontSize: 18, cursor: 'pointer', padding: 4 }}>⟳</button><button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: 'none', border: '1px solid #444', color: '#ccc', fontSize: 13, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Выйти</button></div>
      </div>

      <div style={{ padding: '16px 62px 40px 12px' }}>
        {loading && orders.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div>}
        {tab === 'production' && <div>
          <div style={{ background: '#f3eeff', color: '#7a3aaa', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>📋 Входящие заказы на производство. «✓ Принял» → карточка на столе мастера (вкладка 🛠️ Производство).</div>
          <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
          {prodQueue.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>📋</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет заказов на производство</div></div> : prodQueue.map(o => <OrderCard key={o.id} o={o} showActions={true} prodFlow={isProd(o)} />)}
        </div>}
        {tab === 'spec' && <div>
          <div style={{ background: '#e8f1ff', color: '#2a5aaa', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>🧰 Проект = мастер-список (не карточка). Из него по частям «➕ Создать карточку»: серым — базовое кол-во/остаток, в пустое поле впиши сколько нужно.</div>
          <button onClick={() => setShowSpecBuilder(v => !v)} style={{ marginBottom: 12, padding: '9px 16px', borderRadius: 8, border: showSpecBuilder ? '1.5px solid #e6e2dc' : 'none', background: showSpecBuilder ? '#fff' : PRIMARY, color: showSpecBuilder ? '#5f5952' : '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{showSpecBuilder ? '× Отмена' : '＋ Новый проект'}</button>
          {showSpecBuilder && <SpecProjectWorkbench products={products} contragents={cags} showMsg={showMsg} onDone={() => { setShowSpecBuilder(false); loadSpec() }} />}
          {specProjects.length === 0 && !showSpecBuilder ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>🧰</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Проектов нет</div><div style={{ fontSize: 13, color: '#5f5952' }}>Создай проект — набери что нужно, потом вытаскивай карточками.</div></div>
            : specProjects.map((sp: any) => {
              const done = sp.items.every((i: any) => Number(i.remaining) <= 0)
              const carving = carveFor === sp.id
              return (
                <div key={sp.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 10, boxShadow: carving ? '0 0 0 2px #b8cdea' : '0 0 0 1.5px #e6e2dc', padding: '14px 16px', opacity: done && !carving ? .6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{sp.name}</span>
                    <span style={{ fontSize: 12, color: '#5f5952', marginLeft: 'auto' }}>вынесено {sp.totalDrawn} / {sp.totalQty}</span>
                  </div>
                  {sp.items.map((it: any) => {
                    const rem = Number(it.remaining)
                    const q = specQ[it.id] ?? ''
                    return (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f6f3f0' }}>
                        <RalDot code={extractRal(it.name)} size={14} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: rem <= 0 ? '#9a938a' : '#26231f', textDecoration: rem <= 0 ? 'line-through' : 'none' }}>{it.name}</span>
                        {it.widthCm != null && <span style={{ fontSize: 11, color: '#7a3aaa', fontWeight: 700, background: '#f3eeff', padding: '1px 7px', borderRadius: 20, flexShrink: 0 }}>{Number(it.widthCm)} см</span>}
                        {/* серым — базовое кол-во / остаток (только показ) */}
                        <span style={{ fontSize: 12, color: '#9a938a', fontWeight: 600, flexShrink: 0, minWidth: 78, textAlign: 'right' }}>ост. {rem} / {Number(it.qty)}</span>
                        {/* пустое поле для ввода нужного кол-ва — только в режиме создания карточки */}
                        {carving && rem > 0 && <input value={q} inputMode="decimal" placeholder="сколько" onChange={e => setSpecQ(p => ({ ...p, [it.id]: e.target.value.replace(/[^0-9.,]/g, '') }))} style={{ width: 68, padding: '6px 8px', borderRadius: 6, border: `1.5px solid ${Number(q) > rem ? '#e0a0a0' : '#b8cdea'}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', flexShrink: 0 }} />}
                        {carving && rem <= 0 && <span style={{ fontSize: 12, color: '#2e8a5e', fontWeight: 700, flexShrink: 0 }}>✓</span>}
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {carving ? <>
                      <button onClick={() => doCarveCard(sp.id)} style={{ flex: 1, border: 'none', background: PRIMARY, color: '#fff', borderRadius: 9, padding: '10px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>✓ Создать карточку</button>
                      <button onClick={() => doCarveLogist(sp.id)} title="Сразу логисту (минуя производство)" style={{ border: '1.5px solid #b8cdea', background: '#e8f1ff', color: '#2a5aaa', borderRadius: 9, padding: '10px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>🚚 Логисту</button>
                      <button onClick={() => { setCarveFor(null); setSpecQ({}) }} style={{ border: '1.5px solid #e6e2dc', background: '#fff', color: '#5f5952', borderRadius: 9, padding: '10px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>✕</button>
                    </> : <button disabled={done} onClick={() => { setCarveFor(sp.id); setSpecQ({}) }} style={{ width: '100%', border: 'none', background: done ? '#e6e2dc' : '#7a3aaa', color: '#fff', borderRadius: 9, padding: '10px', cursor: done ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{done ? '✓ Проект выполнен' : '➕ Создать карточку'}</button>}
                  </div>
                </div>
              )
            })}
        </div>}
        {tab === 'sheets' && <div>
          <div style={{ background: '#e8f5ee', color: '#2e8a5e', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>📄 Индикатор целых листов. Взял лист — тапни цвет, впиши сколько взял, счётчик обновится (видно на главном дашборде).</div>
          <a href={user.slug ? `/listy/${user.slug}` : '/listy'} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginBottom: 12, padding: '9px 16px', borderRadius: 8, background: '#111312', color: '#E75B12', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>🖥 Открыть кабинет листов (по ссылке) →</a>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {ralOrdered(false).map((c: any) => {
              const cnt = sheetQtyOf(c.code); const on = takeColor === c.code
              return (
                <button key={c.code} type="button" onClick={() => { setTakeColor(on ? '' : c.code); setTakeQty('') }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 6px 10px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', background: '#fff', border: on ? `2.5px solid ${PRIMARY}` : '1.5px solid #e6e2dc', boxShadow: on ? '0 4px 14px rgba(212,97,58,.25)' : '0 1px 4px rgba(0,0,0,.06)' }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: cnt > 0 ? '#26231f' : '#c9c3ba', lineHeight: 1 }}>{cnt}</span>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: c.bg || c.hex, boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,.14)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: on ? PRIMARY : '#5f5952' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
                </button>
              )
            })}
          </div>
          {takeColor && (
            <div style={{ marginTop: 14, background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
                <RalDot code={takeColor} size={16} /><b>{takeColor === 'decor' ? 'дерево' : takeColor}</b>
                <span style={{ color: '#5f5952' }}>· в наличии {sheetQtyOf(takeColor)} листов</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input autoFocus value={takeQty} inputMode="numeric" onChange={e => setTakeQty(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && takeLeaf()} placeholder="сколько взял"
                  style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e6e2dc', fontSize: 18, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} />
                <button onClick={takeLeaf} disabled={!(Number(takeQty) > 0)} style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: Number(takeQty) > 0 ? PRIMARY : '#e6e2dc', color: '#fff', cursor: Number(takeQty) > 0 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 15, fontFamily: 'inherit' }}>✓ Записать</button>
              </div>
            </div>
          )}
        </div>}
        {tab === 'produce' && <div>
          <div style={{ background: '#e8f5ee', color: '#2e8a5e', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>🔧 Стол мастера: <b>Принял</b> → <b>В работе</b> → <b>Готов к доставке</b> → отправка логисту. Позиции — в шторке (📋), можно отправить целиком или частями.</div>
          <button onClick={() => setShowDirect(v => !v)} style={{ marginBottom: 12, padding: '9px 16px', borderRadius: 8, border: showDirect ? '1.5px solid #e6e2dc' : 'none', background: showDirect ? '#fff' : PRIMARY, color: showDirect ? '#5f5952' : '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{showDirect ? '× Отмена' : '＋ Прямой заказ на производство'}</button>
          {showDirect && <ProductionWorkbench order={null} uid={user.id} contragents={cags} products={products} specProjects={specProjects} onDone={() => { setShowDirect(false); load(); loadSpec() }} showMsg={showMsg} />}
          {inWork.length === 0 && sold.length === 0 && !showDirect && <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>🔧</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет заказов в работе</div><div style={{ fontSize: 13, color: '#5f5952' }}>Прими заказ во вкладке «Заказы на производство» или создай прямой.</div></div>}

          {([
            { key: 'accepted', title: '📥 ПРИНЯЛ', color: '#7a3aaa', items: accepted, next: { action: 'produceStart', label: '▶ В работу' } },
            { key: 'working', title: '🔧 В РАБОТЕ', color: '#c0532a', items: working, next: { action: 'produceReady', label: '✓ Готов к доставке' } },
            { key: 'ready', title: '✅ ГОТОВ К ДОСТАВКЕ', color: '#2e8a5e', items: ready, next: null as null | { action: string; label: string } },
          ] as const).map(g => g.items.length === 0 ? null : (
            <div key={g.key} style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: g.color, letterSpacing: '.04em', marginBottom: 8 }}>{g.title} · {g.items.length}</div>
              {g.items.map(o => {
                const leg1 = (o.positions || []).filter((p: any) => Number(p.leg) === 1)
                const total = (o.positions || []).length
                return (
                  <div key={o.id} style={{ background: '#fff', borderRadius: 12, boxShadow: `0 0 0 1.5px ${g.color}22`, padding: '11px 13px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: g.color }}>{fmtCode(o.id)}</span>
                      <StatusBadge status={o.status} />
                      {custName(o) && <span style={{ fontSize: 12, color: '#4a4640' }}>👤 {custName(o)}</span>}
                      <span style={{ fontSize: 12, color: '#5f5952', marginLeft: 'auto' }}>{leg1.length < total ? `${total - leg1.length}/${total} у логиста` : `${total} поз.`}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                      <button onClick={() => setDrawerId(o.id)} title="Позиции" style={{ border: '1.5px solid #e6e2dc', background: '#fff', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: '#5f5952' }}>📋 Позиции ({total})</button>
                      {g.next && <button onClick={() => act(o.id, g.next!.action, `✓ ${g.next!.label.replace(/^[▶✓]\s*/, '')}`)} style={{ marginLeft: 'auto', border: `1.5px solid ${g.color}55`, background: `${g.color}14`, color: g.color, borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>{g.next.label}</button>}
                      <button onClick={() => sendCard(o.id)} style={{ marginLeft: g.next ? 0 : 'auto', border: 'none', background: PRIMARY, color: '#fff', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>🚚 Отправить</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {sold.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#2e8a5e', letterSpacing: '.04em', marginBottom: 8 }}>💵 ПРОДАНО · {sold.length}</div>
              {sold.map(o => {
                const total = (o.positions || []).reduce((s: number, p: any) => s + Number(p.qty || 0) * Number(p.price || 0), 0)
                return (
                  <div key={o.id} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #cfeadd', padding: '11px 13px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#2e8a5e' }}>{fmtCode(o.id)}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#2e8a5e' }}>{Math.round(total).toLocaleString('ru-RU')} ₸</span>
                      {o.payment && <span style={{ fontSize: 11, background: '#e8f5ee', color: '#2e8a5e', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{o.payment}</span>}
                      {custName(o) && <span style={{ fontSize: 12, color: '#4a4640' }}>👤 {custName(o)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#5f5952' }}>{Number(o.paidCash) > 0 ? `нал ${Math.round(Number(o.paidCash)).toLocaleString('ru-RU')}` : ''}{Number(o.paidKaspi) > 0 ? ` · каспи ${Math.round(Number(o.paidKaspi)).toLocaleString('ru-RU')}` : ''}{Number(o.paidQr) > 0 ? ` · QR ${Math.round(Number(o.paidQr)).toLocaleString('ru-RU')}` : ''}</span>
                      <button onClick={() => doUnpay(o.id)} style={{ marginLeft: 'auto', border: '1.5px solid #e6c9b8', background: '#fff', color: '#c0532a', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>↩ Отменить</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>}
        {tab === 'out' && <div><DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />{outgoing.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>📤</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет исходящих</div></div> : outgoing.map(o => <OrderCard key={o.id} o={o} showActions={false} />)}</div>}
        {tab === 'new' && (
          <div>
            {newDone ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: 32, boxShadow: '0 0 0 1px #e6e2dc', textAlign: 'center' }}><div style={{ fontSize: 40, marginBottom: 12 }}>✅</div><div style={{ fontWeight: 700, fontSize: 20, color: '#2e8a5e', marginBottom: 8 }}>Заявка {newDone.id} создана!</div><button onClick={() => { setNewDone(null); setTab('production') }} style={{ marginTop: 8, padding: '10px 20px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← К заказам</button></div>
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
        {[{ key: 'production' as Tab, icon: '📋', label: 'Заказы на производство', badge: prodQueue.length }, { key: 'spec' as Tab, icon: '🧰', label: 'Спец проект', badge: specProjects.filter((sp: any) => sp.remaining > 0).length }, { key: 'produce' as Tab, icon: '🛠️', label: 'Производство', badge: inWork.length }, { key: 'sheets' as Tab, icon: '📄', label: 'Листы', badge: 0 }, { key: 'out' as Tab, icon: '📤', label: 'Исходящие', badge: outgoing.length }, { key: 'new' as Tab, icon: '➕', label: 'Новый', badge: 0 }, { key: 'finance' as Tab, icon: '💰', label: 'Финансы', badge: 0 }].map(({ key, icon, label, badge }) => {
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
