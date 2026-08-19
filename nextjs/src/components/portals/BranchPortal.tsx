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
import { branchOrders, orderAction, createClientOrder, getCard, updatePosition, addPosition, listMessages, sendMessage, setProdStage } from '@/lib/api/orders'
import { fetchRefs, listSpecProjects, carveToLogist, sheetsByColor, takeSheet } from '@/lib/api/refs'
import { logout } from '@/lib/api/auth'
import { useLiveData } from '@/lib/live'
import { SHEET_WIDTH_CM } from '@/lib/production'
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
  const [sheets, setSheets] = useState<any[]>([]); const [takeColor, setTakeColor] = useState(''); const [takeQty, setTakeQty] = useState('')
  const [drawerId, setDrawerId] = useState<string | null>(null)   // шторка позиций заказа мастера
  const isZK = (o: any) => /^ЗК-/.test(o.id || '')
  const fmtCode = (id: string) => isZK({ id }) ? id.replace(/-/g, ' ') : id
  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }
  useEffect(() => { fetchRefs().then((r: any) => { setCags((r.contragents || []).filter((c: any) => !c.archived)); setProducts(r.products || []) }) }, [])

  // uid — если кабинет открыт админом «от имени» филиала, все запросы идут от этого филиала.
  const load = useCallback(async () => { setLoading(true); setOrders(await branchOrders(user.id)); setLoading(false) }, [user.id])
  // Пауза live-обновления пока идёт правка: каталог, правка кол-ва, чат, заполнение прямого
  // заказа мастера (showDirect) или открыта шторка — иначе перезагрузка списка сбрасывает ввод.
  const pausedRef = useRef(false); pausedRef.current = addCatalogFor !== null || Object.keys(editQty).length > 0 || (selected !== null && detailTab === 'chat') || showDirect || drawerId !== null || showSpecBuilder
  useLiveData(() => { if (!pausedRef.current) load() }, [])
  useEffect(() => { setSelected(null); setDetailTab('positions') }, [tab])

  // Спец-проекты мастера (очередь) — грузим при заходе на вкладку.
  const loadSpec = useCallback(async () => { setSpecProjects(await listSpecProjects(user.orgId)) }, [user.orgId])
  useEffect(() => { if (tab === 'spec') loadSpec() }, [tab, loadSpec])
  // Вынести часть позиции спец-проекта → сразу к логисту (Исходящие), остаток вычитается.
  async function carveLogist(projectId: string, specItemId: string, qty: number) {
    const r: any = await carveToLogist(projectId, [{ specItemId, qty }])
    if (r.ok) { showMsg(`✓ ${qty} шт → логисту${r.data?.id ? ' (' + r.data.id + ')' : ''}`); setSpecQ(p => { const n = { ...p }; delete n[specItemId]; return n }); await loadSpec(); await load() }
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
  const notForwarded = (o: any) => !['outgoing', 'accounting', 'bookkeeping', 'archive'].includes(o.screen)
  // Плечо-заказ остаётся у филиала как «производство», пока не ЗАКРЫТ (bookkeeping/archive),
  // даже если у ГОЛОВНОГО он ушёл в outgoing — это screen головного, а не «исходящее филиала».
  // «Исходящее филиала» = филиал сам передал логисту (branchForward меняет leg 1→2 → isProd=false).
  const notClosed = (o: any) => !['bookkeeping', 'archive'].includes(o.screen)
  // Поток производителя: [Заказы на производство] «🛠️ В работу» → [Производство: стол мастера,
  // раскрой+гибка, статус «К выполнению»] «✓ Выполнено» → [готово, статус «Выполнено»] «К логисту» → Исходящие.
  // Этапы производства (со старыми названиями для совместимости):
  const isCut = (o: any) => ['Распил', 'К выполнению', 'Производство'].includes(o.status)   // этап РАСПИЛ
  const isBend = (o: any) => o.status === 'Листогиб'                                          // этап ЛИСТОГИБ
  const isDone = (o: any) => ['Выполнено', 'Изготовлено'].includes(o.status)                 // готово к логисту
  const inProd = (o: any) => isCut(o) || isBend(o)                                            // на любом рабочем этапе
  const custName = (o: any) => cags.find((c: any) => c.id === o.contactId)?.name || ''
  // Заказы на производство — плечо-1, ещё НЕ взятые мастером (не на этапе и не готово). ЗК тут нет.
  const production = orders.filter(o => isProd(o) && !isZK(o) && !o.isCancelled && notClosed(o) && !inProd(o) && !isDone(o) && inDate(o))
  // РАСПИЛ — стол мастера: раскрой + отметка «распилено». Плечо ИЛИ прямой заказ (ЗК).
  const producing = orders.filter(o => (isProd(o) || isZK(o)) && !o.isCancelled && notClosed(o) && isCut(o) && inDate(o))
  // ЛИСТОГИБ — распилено, гнём. Плечо ИЛИ ЗК.
  const bending = orders.filter(o => (isProd(o) || isZK(o)) && !o.isCancelled && notClosed(o) && isBend(o) && inDate(o))
  // Готово (Выполнено) — ждёт передачи логисту. После «К логисту» уходит в Исходящие.
  const readyProd = orders.filter(o => (isProd(o) || isZK(o)) && !o.isCancelled && notForwarded(o) && isDone(o) && inDate(o)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const incoming = orders.filter(o => ['incoming', 'reception'].includes(o.screen) && !o.isCancelled && !isProd(o) && !isZK(o) && inDate(o))
  // Для филиала входящее = заказы на производство: объединяем в одну вкладку (без дубля «Входящие»).
  // Списки не пересекаются (production — плечо isProd; incoming — не-плечо), у каждой карточки свой поток.
  const prodQueue = [...production, ...incoming].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  // Исходящие филиала — только НЕ плечо-производство (leg 1). Плечо-заказ, отправленный
  // головным (screen=outgoing, leg 1), сюда НЕ попадает — он в «Заказы на производство».
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
  // Готовый заказ (Выполнено) → передать логисту: уходит в Исходящие. Отдельный шаг после «Выполнено».
  async function toLogist(id: string) {
    try {
      const r = await orderAction(id, 'branchForward'); if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
      setDrawerId(null); await load(); showMsg('✓ Передано логисту')
    } catch { showMsg('⚠ Ошибка сети') }
  }
  // Отметить одну позицию выполненной.
  async function posComplete(cardId: string, posId: string) {
    await updatePosition(cardId, posId, { status: 'Выполнено' }); await refreshDetail(cardId); await load(); showMsg('✓ Позиция выполнена')
  }
  // Этап позиции: cut (распилено) / bent (согнуто). Карточка сама едет Распил→Листогиб→Выполнено.
  async function markStage(cardId: string, posId: string, stage: 'cut' | 'bent') {
    const r = await setProdStage(cardId, posId, stage)
    if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
    await refreshDetail(cardId); await load(); showMsg(stage === 'cut' ? '✓ Распилено' : '✓ Согнуто')
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
                  isDone(o)
                    ? <button onClick={() => act(o.id, 'branchForward', '✓ Передано логисту')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>К логисту →</button>
                    : <button onClick={() => act(o.id, 'produceAccept', '🛠️ Взято к выполнению')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#7a3aaa', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>🛠️ В работу</button>
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

  // Карточка этапа ЛИСТОГИБ: список позиций с пометкой «✓ Согнуто» по каждой.
  // Позиция готова (bent) — зачёркнута. Когда все согнуты — карточка авто → «Выполнено».
  function BendCard({ o }: { o: any }) {
    const pos = (o.positions || []).filter((p: any) => Number(p.leg) === 1)   // только листогиб
    const stock = (o.positions || []).filter((p: any) => Number(p.leg) !== 1) // складские — не наши
    const done = pos.filter((p: any) => p.prodStage === 'bent').length
    return (
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #cfe0f5', padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#2a5aaa' }}>{fmtCode(o.id)}</span>
          <StatusBadge status={o.status} />
          {custName(o) && <span style={{ fontSize: 12, color: '#4a4640' }}>👤 {custName(o)}</span>}
          <span style={{ fontSize: 12, color: '#5f5952', marginLeft: 'auto' }}>согнуто {done}/{pos.length}</span>
        </div>
        {pos.map((p: any) => {
          const bent = p.prodStage === 'bent'
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f6f3f0' }}>
              <RalDot code={extractRal(p.name1c || p.oral)} size={14} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: bent ? '#9a938a' : '#26231f', textDecoration: bent ? 'line-through' : 'none' }}>{p.name1c || p.oral}</span>
              {p.widthCm != null && <span style={{ fontSize: 11, color: '#7a3aaa', fontWeight: 700, background: '#f3eeff', padding: '1px 7px', borderRadius: 20, flexShrink: 0 }}>{Number(p.widthCm)} см</span>}
              <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600, flexShrink: 0 }}>{Number(p.qty)} {p.unit}</span>
              {bent
                ? <span style={{ fontSize: 12, color: '#2e8a5e', fontWeight: 700, flexShrink: 0 }}>✓ согнуто</span>
                : <button onClick={() => markStage(o.id, p.id, 'bent')} style={{ border: '1.5px solid #b8cdea', background: '#e8f1ff', color: '#2a5aaa', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>✓ Согнуто</button>}
            </div>
          )
        })}
        {stock.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#837c72' }}>📦 Со склада ({stock.length}) — не ваш этап, поедут с заказом.</div>}
      </div>
    )
  }

  // Карточка этапа РАСПИЛ, ПОСЛЕ подтверждённого раскроя: пометка «✓ Распилено» по позиции.
  // Когда все распилены — карточка авто → «Листогиб».
  function CutCard({ o }: { o: any }) {
    const pos = (o.positions || []).filter((p: any) => Number(p.leg) === 1)   // только листогиб
    const stock = (o.positions || []).filter((p: any) => Number(p.leg) !== 1) // складские — не наши
    const done = pos.filter((p: any) => p.prodStage === 'cut' || p.prodStage === 'bent').length
    return (
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e0d4ef', padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#7a3aaa' }}>{fmtCode(o.id)}</span>
          <StatusBadge status={o.status} />
          <span style={{ fontSize: 11, background: '#e8f5ee', color: '#2e8a5e', padding: '1px 7px', borderRadius: 20, fontWeight: 700 }}>📐 раскрой ✓</span>
          {custName(o) && <span style={{ fontSize: 12, color: '#4a4640' }}>👤 {custName(o)}</span>}
          <span style={{ fontSize: 12, color: '#5f5952', marginLeft: 'auto' }}>распилено {done}/{pos.length}</span>
        </div>
        {pos.map((p: any) => {
          const cut = p.prodStage === 'cut' || p.prodStage === 'bent'
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f6f3f0' }}>
              <RalDot code={extractRal(p.name1c || p.oral)} size={14} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cut ? '#9a938a' : '#26231f', textDecoration: cut ? 'line-through' : 'none' }}>{p.name1c || p.oral}</span>
              {p.widthCm != null && <span style={{ fontSize: 11, color: '#7a3aaa', fontWeight: 700, background: '#f3eeff', padding: '1px 7px', borderRadius: 20, flexShrink: 0 }}>{Number(p.widthCm)} см</span>}
              <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600, flexShrink: 0 }}>{Number(p.qty)} {p.unit}</span>
              {cut
                ? <span style={{ fontSize: 12, color: '#2e8a5e', fontWeight: 700, flexShrink: 0 }}>✓ распилено</span>
                : <button onClick={() => markStage(o.id, p.id, 'cut')} style={{ border: '1.5px solid #d8c4ec', background: '#f3eeff', color: '#7a3aaa', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>✓ Распилено</button>}
            </div>
          )
        })}
        {stock.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#837c72' }}>📦 Со склада ({stock.length}) — не ваш этап, поедут с заказом.</div>}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Golos Text', system-ui, sans-serif", maxWidth: 480, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, whiteSpace: 'nowrap' }}>{toast}</div>}
      {addCatalogFor && <NomPicker onPick={items => addToOrder(addCatalogFor, items)} onClose={() => setAddCatalogFor(null)} />}

      {/* Шторка позиций заказа мастера (ЗК-…) */}
      {drawerId && (() => {
        const o = orders.find(x => x.id === drawerId); if (!o) return null
        const pos = o.positions || []
        return (
          <div onClick={() => setDrawerId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.4)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(380px, 90vw)', height: '100%', background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#7a3aaa' }}>{fmtCode(o.id)}</span>
                <StatusBadge status={o.status} />
                <button onClick={() => setDrawerId(null)} style={{ marginLeft: 'auto', border: 'none', background: '#f1efec', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 15, color: '#5f5952' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '10px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em' }}>ЗАКАЗЧИК:</span>
                  <b>{custName(o) || '—'}</b>
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em', marginBottom: 8 }}>ПОЗИЦИИ · {pos.length}</div>
                {pos.length === 0 ? <div style={{ color: '#837c72', fontSize: 14, padding: 8 }}>Нет позиций</div>
                  : pos.map((p: any) => {
                    const done = p.status === 'Выполнено' || p.status === 'Изготовлено'
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid #f6f3f0' }}>
                        <RalDot code={extractRal(p.name1c || p.oral)} size={14} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: done ? '#9a938a' : '#26231f', textDecoration: done ? 'line-through' : 'none' }}>{p.name1c || p.oral}</span>
                        <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600, flexShrink: 0 }}>{Number(p.qty)} {p.unit}</span>
                        {done
                          ? <span style={{ fontSize: 12, color: '#2e8a5e', fontWeight: 700, flexShrink: 0 }}>✓ готово</span>
                          : <button onClick={() => posComplete(o.id, p.id)} style={{ border: '1.5px solid #b8e0c8', background: '#e8f5ee', color: '#2e8a5e', borderRadius: 7, padding: '4px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>✓ Выполнено</button>}
                      </div>
                    )
                  })}
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f1efec' }}>
                <button onClick={() => toLogist(o.id)} style={{ width: '100%', border: 'none', background: PRIMARY, color: '#fff', borderRadius: 9, padding: '11px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>К логисту →</button>
              </div>
            </div>
          </div>
        )
      })()}

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
        {tab === 'production' && <div>
          <div style={{ background: '#f3eeff', color: '#7a3aaa', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>📋 Входящие заказы на производство. Плечо → «🛠️ В работу», прочие → «✓ Принял».</div>
          <DateFilter period={period} day={day} onChange={(p, d) => { setPeriod(p); setDay(d) }} />
          {prodQueue.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>📋</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет заказов на производство</div></div> : prodQueue.map(o => <OrderCard key={o.id} o={o} showActions={true} prodFlow={isProd(o)} />)}
        </div>}
        {tab === 'spec' && <div>
          <div style={{ background: '#e8f1ff', color: '#2a5aaa', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>🧰 Свои комплектующие: набери позиции, увидь раскрой, отрабатывай тут. Готовое (можно частью) → сразу логисту.</div>
          <button onClick={() => setShowSpecBuilder(v => !v)} style={{ marginBottom: 12, padding: '9px 16px', borderRadius: 8, border: showSpecBuilder ? '1.5px solid #e6e2dc' : 'none', background: showSpecBuilder ? '#fff' : PRIMARY, color: showSpecBuilder ? '#5f5952' : '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{showSpecBuilder ? '× Отмена' : '＋ Новый спец-проект'}</button>
          {showSpecBuilder && <SpecProjectWorkbench products={products} showMsg={showMsg} onDone={() => { setShowSpecBuilder(false); loadSpec() }} />}
          {/* Очередь спец-проектов */}
          {specProjects.length === 0 && !showSpecBuilder ? <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>🧰</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Очередь пуста</div><div style={{ fontSize: 13, color: '#5f5952' }}>Создай спец-проект — набери комплектующие с раскроем.</div></div>
            : specProjects.map((sp: any) => {
              const done = sp.items.every((i: any) => Number(i.remaining) <= 0)
              return (
                <div key={sp.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 10, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '14px 16px', opacity: done ? .6 : 1 }}>
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
                        <span style={{ fontSize: 12, color: '#5f5952', flexShrink: 0, minWidth: 74, textAlign: 'right' }}>ост. {rem} / {Number(it.qty)}</span>
                        {rem > 0
                          ? <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                              <input value={q} inputMode="decimal" placeholder="кол-во" onChange={e => setSpecQ(p => ({ ...p, [it.id]: e.target.value.replace(/[^0-9.,]/g, '') }))} style={{ width: 58, padding: '5px 6px', borderRadius: 6, border: `1.5px solid ${Number(q) > rem ? '#e0a0a0' : '#e6e2dc'}`, fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }} />
                              <button disabled={!(Number(q) > 0) || Number(q) > rem} onClick={() => carveLogist(sp.id, it.id, Number(q))} style={{ border: 'none', background: Number(q) > 0 && Number(q) <= rem ? PRIMARY : '#e6e2dc', color: '#fff', borderRadius: 7, padding: '5px 10px', cursor: Number(q) > 0 && Number(q) <= rem ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>К логисту →</button>
                            </div>
                          : <span style={{ fontSize: 12, color: '#2e8a5e', fontWeight: 700, flexShrink: 0 }}>✓ готово</span>}
                      </div>
                    )
                  })}
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
          <div style={{ background: '#e8f5ee', color: '#2e8a5e', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>🔧 Цепочка: <b>Распил</b> (раскрой → распилено) → <b>Листогиб</b> (согнуто) → <b>Готово</b> к логисту. 1 лист = {SHEET_WIDTH_CM} см.</div>
          <button onClick={() => setShowDirect(v => !v)} style={{ marginBottom: 12, padding: '9px 16px', borderRadius: 8, border: showDirect ? '1.5px solid #e6e2dc' : 'none', background: showDirect ? '#fff' : PRIMARY, color: showDirect ? '#5f5952' : '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{showDirect ? '× Отмена' : '＋ Прямой заказ на производство'}</button>
          {showDirect && <ProductionWorkbench order={null} uid={user.id} contragents={cags} products={products} onDone={() => { setShowDirect(false); load() }} showMsg={showMsg} />}
          {producing.length === 0 && bending.length === 0 && !showDirect && readyProd.length === 0 && <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}><div style={{ fontSize: 32, marginBottom: 10 }}>🔧</div><div style={{ fontWeight: 600, marginBottom: 6 }}>Нет заказов в производстве</div><div style={{ fontSize: 13, color: '#5f5952' }}>Прими заказ во вкладке «Заказы на производство» или создай прямой.</div></div>}

          {/* ── ЭТАП 1: РАСПИЛ (раскрой + пометка «распилено» по позициям) ── */}
          {producing.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#7a3aaa', letterSpacing: '.04em', marginBottom: 8 }}>✂️ РАСПИЛ · {producing.length}</div>
              {producing.map(o => o.cutConfirmed
                ? <CutCard key={o.id} o={o} />
                : <ProductionWorkbench key={o.id} order={o} uid={user.id} contragents={cags} products={products} onDone={load} showMsg={showMsg} />)}
            </div>
          )}

          {/* ── ЭТАП 2: ЛИСТОГИБ (пометка «согнуто» по позициям) ── */}
          {bending.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#2a5aaa', letterSpacing: '.04em', marginBottom: 8 }}>🛠️ ЛИСТОГИБ · {bending.length}</div>
              {bending.map(o => <BendCard key={o.id} o={o} />)}
            </div>
          )}

          {/* ── ЭТАП 3: ГОТОВО К ЛОГИСТУ ── */}
          {readyProd.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#2e8a5e', letterSpacing: '.04em', marginBottom: 8 }}>✅ ГОТОВО К ЛОГИСТУ · {readyProd.length}</div>
              {readyProd.map(o => (
                <div key={o.id} style={{ background: '#fff', borderRadius: 10, boxShadow: '0 0 0 1.5px #cfeadd', padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#7a3aaa' }}>{fmtCode(o.id)}</span>
                    <StatusBadge status={o.status} />
                    {custName(o) && <span style={{ fontSize: 12, color: '#4a4640' }}>👤 {custName(o)}</span>}
                    <span style={{ fontSize: 12, color: '#5f5952', marginLeft: 'auto' }}>{fmtDate(o.createdAt)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => setDrawerId(o.id)} title="Позиции" style={{ border: '1.5px solid #e6e2dc', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#5f5952' }}>📋 Позиции ({(o.positions || []).length})</button>
                    <button onClick={() => toLogist(o.id)} style={{ marginLeft: 'auto', border: 'none', background: PRIMARY, color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>К логисту →</button>
                  </div>
                </div>
              ))}
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
        {[{ key: 'production' as Tab, icon: '📋', label: 'Заказы на производство', badge: prodQueue.length }, { key: 'spec' as Tab, icon: '🧰', label: 'Спец проект', badge: specProjects.filter((sp: any) => sp.remaining > 0).length }, { key: 'produce' as Tab, icon: '🛠️', label: 'Производство', badge: producing.length + bending.length }, { key: 'sheets' as Tab, icon: '📄', label: 'Листы', badge: 0 }, { key: 'out' as Tab, icon: '📤', label: 'Исходящие', badge: outgoing.length }, { key: 'new' as Tab, icon: '➕', label: 'Новый', badge: 0 }, { key: 'finance' as Tab, icon: '💰', label: 'Финансы', badge: 0 }].map(({ key, icon, label, badge }) => {
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
