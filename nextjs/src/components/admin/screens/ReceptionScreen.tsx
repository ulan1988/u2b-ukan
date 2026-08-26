'use client'
// Приёмка — форма создания заказа/закупа + списки (ожидание, стол приёмки, черновики,
// автозакуп). Логика передачи карточки — через onAction (родитель) и order.service;
// экран лишь фильтрует по screen/block/status и вызывает действия. Подкомпоненты и
// общий UI вынесены в ./reception/*.
import { useEffect, useState, useRef } from 'react'
import NomInline from '@/components/NomInline'
import ContragentPicker from '@/components/ContragentPicker'
import NomPicker, { type PickedPos } from '@/components/NomPicker'
import { extractRal } from '@/lib/ral'
import { itemName } from '@/lib/itemName'
import { priceForClient, isIzdelie } from '@/lib/lineAmount'
import { COLORS } from '@/lib/colors'
import { fmtDate, isPurchase, sourceStyle, sourceLabel, statusStyle } from '@/lib/adminFmt'
import { fetchRefs, fetchUsers, createOrder } from '@/lib/adminApi'
import { autoPrices, settings as fetchSettings, createSpecProject } from '@/lib/api/refs'
import { Btn, INP, inpSm, LBL, PAY, purple } from './reception/ui'
import PurchaseDraft from './reception/PurchaseDraft'
import ProcessingCard from './reception/ProcessingCard'
import AutoProcure from './reception/AutoProcure'

const CENTER = '🏬 Центр-Склад'
const emptyPos = () => ({ productId: '', name1c: '', widthCm: '', qty: '1', unit: 'шт', price: '', respUserId: '', supplierId: '', deadline: '', payment: '' })

export default function ReceptionScreen({ orders, orgId, onAction, onReload, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void
}) {
  const [products, setProducts] = useState<any[]>([])
  const [allCags, setAllCags] = useState<any[]>([])   // все контрагенты (клиент/поставщик не делим)
  const [defaultCagId, setDefaultCagId] = useState('')
  const [logists, setLogists] = useState<any[]>([])
  const [specs, setSpecs] = useState<any[]>([])
  const [flash, setFlash] = useState('')
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2000) }

  // Форма
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale')
  const [contactId, setContactId] = useState('')
  const [specId, setSpecId] = useState('')
  const [phone, setPhone] = useState('')
  const [deadline, setDeadline] = useState('')
  const [comment, setComment] = useState('')
  const [rows, setRows] = useState<any[]>([emptyPos()])
  const [showCatalog, setShowCatalog] = useState(false)
  const [busy, setBusy] = useState(false)
  const advRef = useRef<any>(null)   // таймер авто-перехода СМ → КОЛ-ВО (пауза после набора)

  function loadSettings() { fetchSettings(orgId).then((s: any) => { setSpecs((s.specProjects || []).filter((p: any) => p.status === 'active')); setDefaultCagId(s.defaultContragentId || '') }) }
  useEffect(() => {
    fetchRefs().then((r: any) => {
      const inOrg = (x: any) => !x.orgId || x.orgId === orgId
      setProducts(r.products || [])
      // Один общий список контрагентов — клиент может быть и поставщиком, не делим.
      setAllCags((r.contragents || []).filter(inOrg))
    })
    fetchUsers().then((us: any[]) => setLogists(us.filter(u => u.role === 'logist' && u.orgId === orgId)))
    loadSettings()
  }, [orgId]) // eslint-disable-line

  function openForm(k: 'sale' | 'purchase') { setKind(k); setOpen(true); setRows([emptyPos()]) }
  const setRow = (i: number, patch: any) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  // Тип цены заказчика (розница/опт/спец) для автоподстановки. Для изделий это цена ЗА СМ.
  const clientPT = () => (allCags.find((c: any) => c.id === contactId)?.priceType) || 'retail'
  function pickProduct(i: number, p: any) { const pr = kind === 'sale' ? priceForClient(p, clientPT()) : (Number(p.priceIn) || 0); setRow(i, { productId: p.id, name1c: p.name, unit: p.unit || 'шт', ...(p.widthCm != null ? { widthCm: String(p.widthCm) } : {}), price: pr > 0 ? String(pr) : '' }) }
  const assignAllLogist = (uid: string) => uid && setRows(rs => rs.map(r => ({ ...r, respUserId: uid })))
  const assignAllSupplier = (sid: string) => sid && setRows(rs => rs.map(r => ({ ...r, supplierId: sid })))

  async function pullPrices() {
    const ids = rows.map(r => r.productId).filter(Boolean)
    // Изделия часто без товара 1С — подтягиваем цену и ПО ИМЕНИ (спец/опт/розница = цена за см).
    const names = rows.filter(r => !r.productId && (r.name1c || '').trim()).map(r => (r.name1c || '').trim())
    if (!ids.length && !names.length) { toast('Нет позиций для цен'); return }
    const prices: any = await autoPrices(ids, kind === 'sale' ? (contactId || undefined) : undefined, names)
    setRows(rs => rs.map(r => {
      const byId = r.productId && prices[r.productId] != null ? prices[r.productId] : null
      const nm = (r.name1c || '').trim()
      const byName = nm && prices[nm] != null ? prices[nm] : null
      const v = byId ?? byName
      return v != null ? { ...r, price: String(v) } : r
    }))
    toast('Цены подтянуты')
  }
  function addFromCatalog(items: PickedPos[]) {
    setRows(rs => [...rs.filter(r => r.name1c || r.productId), ...items.map(it => { const cm = it.widthCm != null ? String(it.widthCm) : ''; const nm = itemName({ name: it.name1c || it.oral, color: extractRal(it.name1c || it.oral), cm }); return { ...emptyPos(), name1c: nm, widthCm: cm, qty: String(it.qty), unit: it.unit } })])
    setShowCatalog(false)
  }
  // Инлайн-создание проекта — сразу на выбранного клиента (Автор), чтобы попал в его фильтр.
  async function newSpec() { const name = window.prompt('Название спецпроекта'); if (!name) return; const r: any = await createSpecProject({ orgId, name, clientId: contactId || undefined }); if (r.ok || r.id) { loadSettings(); if (r.id) setSpecId(r.id); toast('Спецпроект создан') } }

  async function submit(asDraft: boolean) {
    setBusy(true)
    const client = allCags.find(c => c.id === contactId)
    const positions = rows.filter(r => r.name1c || r.productId).map(r => { const nm = itemName({ name: r.name1c, color: extractRal(r.name1c), cm: r.widthCm }); return ({
      productId: r.productId || undefined, name1c: nm, oral: nm, qty: Number(r.qty) || 0, unit: r.unit,
      widthCm: r.widthCm ? Number(r.widthCm) : undefined,
      price: Number(r.price) || 0, respUserId: r.respUserId || undefined, supplierId: r.supplierId || undefined,
      deadline: r.deadline || undefined, payment: r.payment || '',
    }) })
    const body: any = {
      orgId, kind, comment, phone, deadline: deadline || undefined, positions,
      specProjectId: specId || undefined,
      screen: asDraft ? 'incoming' : 'reception', block: asDraft ? '' : 'processing', isDraft: asDraft,
    }
    if (kind === 'sale') { body.contactId = contactId || undefined; body.fromName = client?.name || '' }
    else body.fromName = 'Центр-Склад'
    const r: any = await createOrder(body)
    setBusy(false)
    if (r.id || r.ok) { setOpen(false); setContactId(''); setSpecId(''); setPhone(''); setDeadline(''); setComment(''); setRows([emptyPos()]); onReload(); toast(asDraft ? 'Черновик сохранён' : 'Отправлено') }
  }

  const waiting = orders.filter(o => o.screen === 'reception' && o.block !== 'processing' && !o.isCancelled)
  const processing = orders.filter(o => o.screen === 'reception' && o.block === 'processing' && !o.isCancelled)
  const purchaseDrafts = orders.filter(o => o.isDraft && isPurchase(o) && !o.isCancelled)
  const saleDrafts = orders.filter(o => o.isDraft && !isPurchase(o) && !o.isCancelled)
  const changed = orders.filter(o => o.isChanged && !o.isCancelled)
  const allDrafts = orders.filter(o => o.isDraft && !o.isCancelled)

  const counters = [
    { label: 'В ожидании', val: waiting.length, bg: '#fff0ea', color: '#c0532a' },
    { label: 'К приёму', val: processing.length, bg: '#fdf8e1', color: '#8a6f00' },
    { label: 'Изменено', val: changed.length, bg: '#faeaea', color: '#b03020' },
    { label: 'Черновики', val: allDrafts.length, bg: '#efece8', color: '#6b655b' },
  ]

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}

      {/* Счётчики */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Приёмка</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {counters.map(c => <div key={c.label} style={{ background: c.bg, color: c.color, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>{c.label} {c.val}</div>)}
        </div>
      </div>

      {/* Форма создания */}
      <div style={{ background: '#fff', borderRadius: 14, marginBottom: 20, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: open ? '1px solid #f1efec' : 'none' }}>
          {(['sale', 'purchase'] as const).map(k => {
            const active = open && kind === k; const isP = k === 'purchase'
            return (
              <button key={k} onClick={() => (active ? setOpen(false) : openForm(k))}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: active ? (isP ? purple : COLORS.primary) : '#f6f3f0', color: active ? '#fff' : (isP ? purple : COLORS.primary), boxShadow: active ? 'none' : `inset 0 0 0 1.5px ${isP ? '#e3d4f0' : '#f0d9cd'}` }}>
                ＋ {isP ? 'Создать закуп' : 'Создать заказ'}
              </button>
            )
          })}
          {open && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: kind === 'purchase' ? purple : COLORS.primary }}>{kind === 'purchase' ? 'ЗАКУП · получатель Центр-Склад' : 'ПРОДАЖА'}</span>}
        </div>

        {open && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={LBL}>{kind === 'purchase' ? 'ПОЛУЧАТЕЛЬ' : 'К КОМУ (КЛИЕНТ) *'}</label>
                {kind === 'purchase'
                  ? <input style={{ ...INP, background: '#f6f3f0', color: purple, fontWeight: 700 }} value={CENTER} disabled />
                  : <ContragentPicker contragents={allCags} value={contactId} defaultId={defaultCagId} onPick={c => { setContactId(c.id); setSpecId('') }} placeholder="— выберите контрагента —" />}
              </div>
              <div>
                <label style={LBL}>ПРОЕКТ{contactId ? ' (клиента)' : ''}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select style={{ ...INP, flex: 1 }} value={specId} onChange={e => setSpecId(e.target.value)}><option value="">—</option>{specs.filter(p => !contactId || !p.clientId || p.clientId === contactId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <button onClick={newSpec} style={{ padding: '0 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#f1efec', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>＋</button>
                </div>
              </div>
              <div><label style={LBL}>ТЕЛЕФОН</label><input style={INP} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 700 000 00 00" /></div>
              <div><label style={LBL}>СРОК</label><input style={INP} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={LBL}>КОММЕНТАРИЙ</label><textarea style={{ ...INP, minHeight: 56, resize: 'vertical' }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Дополнительные пожелания..." /></div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em' }}>ПОЗИЦИИ</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', background: '#f8f6f3', borderRadius: 8, padding: '5px 8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>КО ВСЕМ:</span>
                <select style={{ ...inpSm, width: 150 }} value="" onChange={e => assignAllLogist(e.target.value)}><option value="">Логист →</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                {kind === 'purchase' && <div style={{ width: 160 }}><ContragentPicker contragents={allCags} value="" defaultId={defaultCagId} onPick={c => c?.id && assignAllSupplier(c.id)} placeholder="Поставщик → всем" /></div>}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead><tr style={{ background: '#f1efec' }}>{['НАИМЕНОВАНИЕ', 'СМ', 'КОЛ-ВО', 'ЕД.', 'ЦЕНА (ТГ)', 'ЛОГИСТ', 'ПОСТАВЩИК', 'СРОК', 'ОПЛАТА', ''].map(h => <th key={h} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1efec' }}>
                      <td style={{ padding: '6px 4px', minWidth: 220 }}><NomInline products={products} value={r.productId} name={r.name1c} onPick={p => pickProduct(i, p)} /></td>
                      <td style={{ padding: '6px 4px', width: 64 }}><input style={inpSm} type="number" placeholder="см" value={r.widthCm} onChange={e => { const cm = e.target.value; setRow(i, { widthCm: cm, name1c: r.name1c ? itemName({ name: r.name1c, color: extractRal(r.name1c), cm }) : r.name1c }) }} /></td>
                      <td style={{ padding: '6px 4px', width: 70 }}><input data-qty style={inpSm} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 56 }}><input style={inpSm} value={r.unit} onChange={e => setRow(i, { unit: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 100 }}><input style={{ ...inpSm, textAlign: 'right', fontWeight: 600 }} type="number" value={r.price} onChange={e => setRow(i, { price: e.target.value })} placeholder={isIzdelie(r.name1c) ? 'за см' : 'цена'} title={isIzdelie(r.name1c) ? 'цена за см (сумма = см × кол-во × цена)' : 'цена за штуку'} /></td>
                      <td style={{ padding: '6px 4px', width: 130 }}><select style={inpSm} value={r.respUserId} onChange={e => setRow(i, { respUserId: e.target.value })}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
                      <td style={{ padding: '6px 4px', width: 150 }}><ContragentPicker contragents={allCags} value={r.supplierId} defaultId={kind === 'purchase' ? defaultCagId : ''} onPick={c => setRow(i, { supplierId: c.id })} placeholder={kind === 'purchase' ? '— поставщик —' : '— производитель —'} style={{ fontSize: 13 }} /></td>
                      <td style={{ padding: '6px 4px', width: 120 }}><input style={inpSm} type="date" value={r.deadline} onChange={e => setRow(i, { deadline: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 120 }}><select style={inpSm} value={r.payment} onChange={e => setRow(i, { payment: e.target.value })}>{PAY.map(p => <option key={p} value={p}>{p || '—'}</option>)}</select></td>
                      <td style={{ padding: '6px 4px', width: 60 }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button onClick={() => setRows(rs => { const arr = [...rs]; arr.splice(i + 1, 0, { ...rs[i] }); return arr })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f5952', fontSize: 15 }} title="Клонировать">📋</button>
                          <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b03020', fontSize: 15 }} title="Удалить">🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setRows(rs => [...rs, emptyPos()])} style={{ border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '6px 16px', background: 'none', cursor: 'pointer', fontSize: 13, color: '#5f5952', fontFamily: 'inherit' }}>＋ Добавить позицию</button>
              <button onClick={() => setShowCatalog(true)} style={{ border: 'none', borderRadius: 7, padding: '6px 16px', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>📖 Каталог</button>
              <button onClick={pullPrices} style={{ border: '1.5px solid #e6c9b8', borderRadius: 7, padding: '6px 16px', background: '#fff8f5', color: '#c0532a', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>💰 Подтянуть цены</button>
            </div>
            {showCatalog && <NomPicker onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}

            <div style={{ display: 'flex', gap: 10, paddingTop: 12, marginTop: 12, borderTop: '1px solid #f1efec' }}>
              <Btn onClick={() => submit(true)} disabled={busy}>Сохранить черновик</Btn>
              <Btn variant="primary" onClick={() => submit(false)} disabled={busy || (kind === 'sale' && !contactId)}>{kind === 'purchase' ? 'ОТПРАВИТЬ ЗАКУП →' : 'ОТПРАВИТЬ ЗАКАЗ →'}</Btn>
              <Btn variant="ghost" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', color: '#5f5952' }}>Отмена</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Автозакуп */}
      <AutoProcure orgId={orgId} onReload={onReload} toast={toast} />

      {/* Черновик закупа (накопитель) */}
      {purchaseDrafts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {purchaseDrafts.map(d => <PurchaseDraft key={d.id} draft={d} logists={logists} contragents={allCags} defaultCagId={defaultCagId} onAction={onAction} onReload={onReload} />)}
        </div>
      )}

      {/* Стол приёмки */}
      {processing.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Стол приёмки <span style={{ fontSize: 13, background: '#fdf8e1', color: '#8a6f00', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{processing.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {processing.map(o => <ProcessingCard key={o.id} order={o} contragents={allCags} defaultCagId={defaultCagId} logists={logists} products={products} onAction={onAction} onReload={onReload} toast={toast} />)}
          </div>
        </div>
      )}

      {/* Ожидание */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Ожидание <span style={{ fontSize: 13, background: '#fff0ea', color: '#c0532a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{waiting.length}</span></div>
        {waiting.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14, padding: '16px 0' }}>Нет карточек в ожидании</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
              {waiting.map(o => (
                <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: COLORS.primary }}>{o.id}</span>
                    {o.source && <span style={sourceStyle(o.source)}>{sourceLabel(o.source)}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952' }}>{fmtDate(o.createdAt)}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{o.fromName} → {o.toName || '—'}</div>
                  {o.comment && <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{o.comment}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="primary" onClick={() => onAction(o.id, 'take')} style={{ flex: 1 }}>ПРИНЯТЬ В ОБРАБОТКУ →</Btn>
                    <Btn onClick={() => onAction(o.id, 'returnToIncoming')}>← Вернуть</Btn>
                  </div>
                </div>
              ))}
            </div>}
      </div>

      {/* Черновики */}
      {saleDrafts.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Черновики <span style={{ fontSize: 13, background: '#efece8', color: '#6b655b', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{saleDrafts.length}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {saleDrafts.map(o => (
              <div key={o.id} style={{ background: '#faf8f6', borderRadius: 12, padding: 16, border: '1.5px dashed #d8d3cc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: '#5f5952' }}>{o.id}</span>
                  <span style={statusStyle('Черновик')}>Черновик</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952' }}>{fmtDate(o.createdAt)}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{o.fromName}</div>
                {o.comment && <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 10 }}>{o.comment.slice(0, 60)}...</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={() => onOpen?.(o)}>Доработать</Btn>
                  <Btn variant="primary" onClick={() => onAction(o.id, 'accept')}>Отправить</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
