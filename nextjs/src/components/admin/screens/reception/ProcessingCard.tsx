'use client'
// Стол приёмки: карточка с инлайн-редактором позиций (наим.1С/кол-во/цена/логист/срок/оплата),
// автоподбор товара из «со слов», подтяжка цен, отправка в Исходящие.
import { useEffect, useMemo, useRef, useState } from 'react'
import NomInline from '@/components/NomInline'
import ContragentPicker from '@/components/ContragentPicker'
import { matchNom } from '@/lib/nomMatch'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate, statusStyle } from '@/lib/adminFmt'
import { updatePosition, addPosition, deletePosition, updateCard } from '@/lib/adminApi'
import { autoPrices } from '@/lib/api/refs'
import { Btn, inpSm, purple, PAY } from './ui'

export default function ProcessingCard({ order, contragents, defaultCagId, logists, products, onAction, onReload, toast }: { order: any; contragents: any[]; defaultCagId: string; logists: any[]; products: any[]; onAction: (id: string, a: string) => void; onReload: () => void; toast: (m: string) => void }) {
  const [editing, setEditing] = useState<Record<string, any>>({})
  const ps = order.positions || []

  // Цена из базы по типу цены получателя: опт-клиент → priceOpt, иначе priceRetail (как в Улкане).
  const clientOpt = contragents.find((c: any) => c.id === order.contactId)?.priceType === 'opt'
  const priceOf = (p: any, fallback = 0) => { const v = clientOpt ? p.priceOpt : p.priceRetail; return v != null ? Number(v) : fallback }

  // Автоподбор «наим. 1С» из «со слов» (устного названия клиента) по справочнику.
  const matches = useMemo(() => {
    const m: Record<string, any> = {}
    for (const p of ps) if (!(p.name1c || '').trim() && (p.oral || '').trim()) m[p.id] = matchNom(p.oral, products)
    return m
  }, [ps, products])

  // 100% совпадение → подставляем товар автоматически (один раз на позицию).
  const appliedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!products.length) return
    for (const pos of ps) {
      if ((pos.name1c || '').trim() || !(pos.oral || '').trim() || appliedRef.current.has(pos.id)) continue
      const ex = matches[pos.id]?.exact
      if (ex) {
        appliedRef.current.add(pos.id)
        updatePosition(order.id, pos.id, { productId: ex.id, name1c: ex.name, unit: ex.unit || pos.unit, price: priceOf(ex, Number(pos.price) || 0) }).then(onReload)
      }
    }
  }, [matches, products.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Применить кандидата-подсказку (частичное совпадение) по клику.
  function applyMatch(pos: any, p: any) {
    updatePosition(order.id, pos.id, { productId: p.id, name1c: p.name, unit: p.unit || pos.unit, price: priceOf(p, Number(pos.price) || 0) }).then(onReload)
  }

  async function upd(posId: string, patch: any) { await updatePosition(order.id, posId, patch); onReload() }
  function startEdit(pos: any) {
    // Если «наим. 1С» пусто — предзаполняем точным совпадением из «со слов».
    const ex = (!(pos.name1c || '').trim() && (pos.oral || '').trim()) ? matchNom(pos.oral, products).exact : null
    setEditing(e => ({ ...e, [pos.id]: { productId: ex?.id || pos.productId || '', name1c: ex?.name || pos.name1c, qty: String(pos.qty), unit: ex?.unit || pos.unit, price: ex ? String(priceOf(ex, Number(pos.price) || 0)) : String(pos.price), respUserId: pos.respUserId || '', deadline: pos.deadline ? String(pos.deadline).slice(0, 10) : '', payment: pos.payment || '' } }))
  }
  function cancelEdit(id: string) { setEditing(e => { const n = { ...e }; delete n[id]; return n }) }
  async function saveEdit(pos: any) {
    const ed = editing[pos.id]
    await updatePosition(order.id, pos.id, { productId: ed.productId || undefined, name1c: ed.name1c, qty: Number(ed.qty) || 0, unit: ed.unit, price: Number(ed.price) || 0, respUserId: ed.respUserId || undefined, deadline: ed.deadline || null, payment: ed.payment })
    cancelEdit(pos.id); onReload()
  }
  async function clone(pos: any) { await addPosition(order.id, { name1c: pos.name1c, oral: pos.oral, qty: Number(pos.qty), unit: pos.unit, price: Number(pos.price), respUserId: pos.respUserId || undefined, supplierId: pos.supplierId || undefined }); onReload(); toast('Позиция клонирована') }
  async function del(pos: any) { await deletePosition(order.id, pos.id); onReload() }
  async function pullPrices() {
    const ids = ps.map((p: any) => p.productId).filter(Boolean)
    if (!ids.length) { toast('Нет товаров 1С для цен'); return }
    const prices: any = await autoPrices(ids, order.contactId || undefined)
    for (const p of ps) if (p.productId && prices[p.productId] != null) await updatePosition(order.id, p.id, { price: prices[p.productId] })
    onReload(); toast('Цены подтянуты')
  }
  async function send() {
    // Сначала сохраняем все открытые правки позиций (как в Улкане), потом валидация.
    for (const pos of ps) { if (editing[pos.id]) await saveEdit(pos) }
    const eff = (p: any) => editing[p.id] || {}
    if (ps.some((p: any) => !((eff(p).name1c ?? p.name1c) || '').trim())) { toast('⚠️ Заполните НАИМ. 1С у всех позиций'); return }
    if (!order.contactId && order.kind === 'sale') { toast('Укажите получателя (Кому)'); return }
    if (ps.some((p: any) => !(eff(p).respUserId ?? p.respUserId))) { toast('Назначьте логиста всем позициям'); return }
    onAction(order.id, 'process')
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#faf8f6', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14, color: COLORS.primary }}>{order.id}</span>
        <span style={statusStyle(order.status)}>{order.status}</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{order.fromName} →</span>
        {order.kind === 'sale'
          ? <div style={{ minWidth: 180 }}><ContragentPicker contragents={contragents} value={order.contactId || ''} defaultId={defaultCagId} onPick={c => updateCard(order.id, { contactId: c.id }).then(onReload)} placeholder="К кому / куда" /></div>
          : <span style={{ fontSize: 13, color: purple, fontWeight: 700 }}>Центр-Склад</span>}
        {order.deadline && <span style={{ fontSize: 13, color: '#5f5952' }}>срок {fmtDate(order.deadline)}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inpSm, width: 140 }} value="" onChange={e => { if (e.target.value) ps.forEach((p: any) => upd(p.id, { respUserId: e.target.value })) }}><option value="">Логист → всем</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <button onClick={pullPrices} style={{ border: '1.5px solid #e6c9b8', borderRadius: 7, padding: '5px 12px', background: '#fff8f5', color: '#c0532a', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>💰 Цены</button>
          <Btn onClick={() => onAction(order.id, 'returnToIncoming')}>← Вернуть</Btn>
          <Btn variant="primary" onClick={send}>ОТПРАВИТЬ В ИСХОДЯЩИЕ →</Btn>
        </div>
      </div>

      <div style={{ padding: '12px 16px', overflowX: 'auto' }}>
        {ps.length === 0 && <div style={{ background: '#fff8e1', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 14, color: '#8a6f00', fontWeight: 500 }}>💬 Со слов: {order.comment}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead><tr style={{ background: '#f1efec' }}>{['НАИМ. 1С', 'КОЛ-ВО', 'ЕД.', 'ЦЕНА', 'ЛОГИСТ', 'СРОК', 'ОПЛАТА', ''].map(h => <th key={h} style={{ padding: '7px 8px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {ps.map((pos: any) => {
              const ed = editing[pos.id]; const isEd = !!ed
              return (
                <tr key={pos.id} style={{ borderBottom: '1px solid #f1efec', background: !(isEd ? ed.name1c : pos.name1c) ? '#fff5f0' : 'transparent', cursor: isEd ? 'default' : 'pointer' }} onClick={() => !isEd && startEdit(pos)}>
                  <td style={{ padding: '6px 4px', minWidth: 170 }}>{isEd ? <NomInline products={products} value={ed.productId || ''} name={ed.name1c} onPick={p => setEditing(e => ({ ...e, [pos.id]: { ...e[pos.id], productId: p.id, name1c: p.name, unit: p.unit || e[pos.id].unit, price: String(priceOf(p, Number(e[pos.id]?.price) || 0)) } }))} /> : (pos.name1c ? <span style={{ fontSize: 13 }}>{pos.name1c}</span> : (matches[pos.id]?.near ? <button onClick={e => { e.stopPropagation(); applyMatch(pos, matches[pos.id].near) }} title="Похоже на это — нажмите, чтобы подставить" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff8e1', border: '1.5px dashed #e0b34a', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: '#8a6f00' }}>≈ {matches[pos.id].near.name} <span style={{ fontWeight: 700 }}>✓</span></button> : <span style={{ color: '#837c72' }}>—</span>))}{isEd && ed.name1c && <div style={{ fontSize: 12, color: '#5f5952', marginTop: 2 }}>{ed.name1c}</div>}</td>
                  <td style={{ padding: '6px 4px', width: 70 }}>{isEd ? <input style={{ ...inpSm, width: 60 }} type="number" value={ed.qty} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], qty: e.target.value } }))} /> : <span style={{ fontSize: 13 }}>{Number(pos.qty)}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 50 }}>{isEd ? <input style={{ ...inpSm, width: 44 }} value={ed.unit} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], unit: e.target.value } }))} /> : <span style={{ fontSize: 13 }}>{pos.unit}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 96, whiteSpace: 'nowrap' }}>{isEd ? <input style={{ ...inpSm, width: 84, textAlign: 'right' }} type="number" value={ed.price} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], price: e.target.value } }))} /> : <span style={{ fontSize: 13, fontWeight: 700, color: Number(pos.price) > 0 ? '#26231f' : '#837c72' }}>{Number(pos.price) > 0 ? fmtMoney(Number(pos.price)) : '—'}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 120 }}>{isEd ? <select style={{ ...inpSm, width: 112 }} value={ed.respUserId} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], respUserId: e.target.value } }))}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select> : <span style={{ fontSize: 13 }}>{pos.resp || <span style={{ color: '#837c72' }}>—</span>}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 110 }}>{isEd ? <input style={{ ...inpSm, width: 100 }} type="date" value={ed.deadline} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], deadline: e.target.value } }))} /> : <span style={{ fontSize: 13 }}>{fmtDate(pos.deadline)}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 110 }}>{isEd ? <select style={{ ...inpSm, width: 100 }} value={ed.payment} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], payment: e.target.value } }))}>{PAY.map(p => <option key={p} value={p}>{p || '—'}</option>)}</select> : <span style={{ fontSize: 13 }}>{pos.payment || <span style={{ color: '#837c72' }}>—</span>}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 80 }}>
                    {isEd ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); saveEdit(pos) }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 13 }}>✓</button>
                        <button onClick={e => { e.stopPropagation(); cancelEdit(pos.id) }} style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${pos.name1c || pos.oral} ${Number(pos.qty)} ${pos.unit}`); toast('Скопировано!') }} style={{ padding: '4px 7px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }} title="Копировать">📋</button>
                        <button onClick={e => { e.stopPropagation(); clone(pos) }} style={{ padding: '4px 7px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }} title="Клонировать">🔁</button>
                        <button onClick={e => { e.stopPropagation(); del(pos) }} style={{ padding: '4px 7px', borderRadius: 6, border: '1.5px solid #faeaea', background: '#fff', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {ps.length === 0 && <div style={{ marginTop: 8, color: '#5f5952', fontSize: 13, fontStyle: 'italic' }}>Нажмите «Взять в обработку», чтобы распарсить комментарий в позиции</div>}
      </div>
    </div>
  )
}
