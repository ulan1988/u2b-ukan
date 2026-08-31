'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { getDocument, updateDocument } from '@/lib/api/docs'
import { lineAmount, isIzdelie } from '@/lib/lineAmount'
import ReturnModal from '@/components/admin/ReturnModal'

// «20.000 см» → «20 см» для показа (лишние нули из имени товара)
const cleanNm = (s: string) => String(s || '').replace(/(\d+)\.0+(\s*см)/gi, '$1$2')
const cmOf = (l: any) => { const n = Number(l?.widthCm); return n > 0 ? String(n) : '' }
const amtOf = (l: any) => lineAmount({ name: l.name, qty: Number(l.qty) || 0, price: Number(l.price) || 0, widthCm: l.widthCm })

// Форма накладной (1С УНФ), зеркальная: приходная (закуп) и расходная (продажа).
// Тип определяется по doc.type. Правим «бумажные» поля: вх.номер/дата (только приходная),
// операция, скидка, оплата, коммент + цена/ед./коммент строк.
// Кол-во/склад менять нельзя (это движение склада — отдельный шаг).
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#5f5952', marginBottom: 3, display: 'block', letterSpacing: '.03em' }
const OPS_IN = [{ v: 'receipt', l: 'Поступление от поставщика' }, { v: 'return', l: 'Возврат поставщику' }]
const OPS_OUT = [{ v: 'shipment', l: 'Продажа покупателю' }, { v: 'return', l: 'Возврат от покупателя' }]

export default function InvoiceForm({ id, onClose, onSaved, drawer = false }: { id: string; onClose: () => void; onSaved?: () => void; drawer?: boolean }) {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState<'goods' | 'pay'>('goods')
  const [f, setF] = useState<any>({})            // редактируемая шапка
  const [lines, setLines] = useState<any[]>([])  // редактируемые строки
  const [discMode, setDiscMode] = useState<'pct' | 'sum'>('pct')
  const [priceCm, setPriceCm] = useState<string>('')   // одна цена за см на все изделия (см. калькулятор)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [returning, setReturning] = useState(false)

  useEffect(() => { getDocument(id).then((d: any) => {
    if (!d) return
    setData(d)
    setF({ number: d.doc.number || '', date: d.doc.date ? String(d.doc.date).slice(0, 10) : '', inNumber: d.doc.inNumber || '', inDate: d.doc.inDate || '', operation: d.doc.operation || (d.doc.type === 'sale' ? 'shipment' : 'receipt'), comment: d.doc.comment || '', discountPct: Number(d.doc.discountPct) || 0, discountSum: Number(d.doc.discountSum) || 0, paidSum: Number(d.doc.paidSum) || 0, reviewed: !!d.doc.reviewed })
    const mapped = (d.lines || []).map((l: any) => ({ ...l, price: Number(l.price), qty: Number(l.qty) }))
    setLines(mapped)
    const izd = mapped.find((l: any) => isIzdelie(l.name) && Number(l.price) > 0)   // цена за см (общая) — из первой изделия
    setPriceCm(izd ? String(Number(izd.price)) : '')
  }) }, [id])
  // Применить одну цену за см ко всем изделиям (у изделия price = цена за 1 см).
  const applyPriceCm = (v: string) => { setPriceCm(v); setLines(ls => ls.map(l => isIzdelie(l.name) ? { ...l, price: v } : l)) }

  const subtotal = lines.reduce((s, l) => s + amtOf(l), 0)
  const discountSum = discMode === 'pct' ? Math.round(subtotal * (Number(f.discountPct) || 0)) / 100 : (Number(f.discountSum) || 0)
  const total = Math.max(0, subtotal - discountSum)
  const remain = total - (Number(f.paidSum) || 0)

  async function save(markReviewed?: boolean) {
    setBusy(true)
    const patch: any = {
      number: f.number, date: f.date || undefined, inNumber: f.inNumber, inDate: f.inDate || null, operation: f.operation, comment: f.comment, paidSum: Number(f.paidSum) || 0,
      lines: lines.map(l => ({ id: l.id, price: Number(l.price) || 0, unit: l.unit, comment: l.comment })),
    }
    if (discMode === 'pct') patch.discountPct = Number(f.discountPct) || 0
    else patch.discountSum = Number(f.discountSum) || 0
    if (markReviewed) patch.reviewed = true
    const r: any = await updateDocument(id, patch)
    setBusy(false)
    if (r.ok !== false) { if (markReviewed) setF((p: any) => ({ ...p, reviewed: true })); setFlash(markReviewed ? '✓ Проверено и сохранено' : '✓ Сохранено'); setTimeout(() => setFlash(''), 1500); onSaved?.() }
    else setFlash('⚠ ' + (r.error || 'Ошибка'))
  }

  const o = data?.doc
  const isSale = o?.type === 'sale'
  const OPS = isSale ? OPS_OUT : OPS_IN
  return (
    <div onClick={onClose} style={drawer
      ? { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }
      : { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="anim-pop" style={drawer
        ? { width: 580, maxWidth: '100%', height: '100vh', background: '#fff', boxShadow: '-12px 0 48px rgba(0,0,0,.25)', overflowY: 'auto' }
        : { width: 820, maxWidth: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        {!data ? <div style={{ padding: 48, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : (
          <>
            {/* Шапка */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>{isSale ? 'Расходная накладная' : 'Приходная накладная'}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.primary }}>{o.number}</span>
              <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: o.status === 'cancelled' ? '#faeaea' : '#e8f5ee', color: o.status === 'cancelled' ? '#b03020' : '#2e8a5e', fontWeight: 700 }}>{o.status === 'cancelled' ? 'отменён' : 'проведён'}</span>
              {o.status !== 'cancelled' && !f.reviewed && <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: '#fff3cd', color: '#8a6f00', fontWeight: 700 }}>⚠ не проверено</span>}
              {o.transit && <span title="Сквозная продажа — товар шёл мимо склада (drop-ship)" style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: '#ffe8d6', color: '#c2570f', fontWeight: 700 }}>🔀 Сквозная · мимо склада</span>}
              <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>

            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div><label style={lbl}>НОМЕР (авто, можно менять)</label><input style={inp} value={f.number} onChange={e => setF({ ...f, number: e.target.value })} /></div>
              <div><label style={lbl}>{isSale ? 'ДАТА (день отгрузки)' : 'ДАТА (день приёмки)'}</label><input style={inp} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
              <div><label style={lbl}>{isSale ? 'ПОКУПАТЕЛЬ' : 'ПОСТАВЩИК'}</label><input style={{ ...inp, background: '#f6f3f0' }} value={data.contragent?.name || '—'} disabled /></div>
              <div><label style={lbl}>СКЛАД</label><input style={{ ...inp, background: '#f6f3f0' }} value={data.warehouse?.name || '—'} disabled /></div>
              {!isSale && <div><label style={lbl}>ВХ. НОМЕР</label><input style={inp} value={f.inNumber} onChange={e => setF({ ...f, inNumber: e.target.value })} placeholder="№ накладной поставщика" /></div>}
              {!isSale && <div><label style={lbl}>ВХ. ДАТА</label><input style={inp} type="date" value={f.inDate ? String(f.inDate).slice(0, 10) : ''} onChange={e => setF({ ...f, inDate: e.target.value })} /></div>}
              <div><label style={lbl}>ОПЕРАЦИЯ</label><select style={inp} value={f.operation} onChange={e => { if (e.target.value === 'return') { setReturning(true) } else setF({ ...f, operation: e.target.value }) }}>{OPS.map(op => <option key={op.v} value={op.v}>{op.l}</option>)}</select></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>КОММЕНТАРИЙ</label><input style={inp} value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} /></div>
            </div>

            {/* Вкладки */}
            <div style={{ display: 'flex', gap: 6, padding: '0 20px' }}>
              {([['goods', `Товары · ${lines.length}`], ['pay', 'Оплата']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? '#f1efec' : 'transparent', color: tab === k ? COLORS.text : COLORS.textMuted }}>{l}</button>
              ))}
            </div>

            {tab === 'goods' ? (
              <div style={{ padding: 20, background: '#faf8f6', maxHeight: 340, overflowY: 'auto' }}>
                {lines.some(l => isIzdelie(l.name)) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, background: '#f5eefc', border: '1.5px solid #e0cef0', borderRadius: 10, padding: '10px 14px' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#7a3aaa' }}>📏 ЦЕНА ЗА СМ (изделия):</span>
                    <input style={{ ...inp, width: 110, textAlign: 'right', fontWeight: 700, borderColor: '#d8c4ec' }} type="number" value={priceCm} onChange={e => applyPriceCm(e.target.value)} placeholder="₸ / см" />
                    <span style={{ fontSize: 12, color: '#8a6f00' }}>₸/шт = см × цена за см · сумма = шт × ₸/шт</span>
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ color: COLORS.textMuted, fontSize: 11 }}>{['№', 'Номенклатура', 'Кол-во', 'Ед.', 'СМ', '₸/шт', 'Сумма', 'Коммент'].map((h, i) => <th key={h} style={{ textAlign: i >= 2 && i <= 6 ? 'right' : 'left', padding: '4px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {lines.map((l, i) => { const izd = isIzdelie(l.name); return (
                      <tr key={l.id} style={{ borderTop: '1px solid #efece8' }}>
                        <td style={{ padding: '6px 8px', color: COLORS.textMuted }}>{(l as any).sourcePosId ? String((l as any).sourcePosId).split('-P')[1] ? 'P' + String((l as any).sourcePosId).split('-P')[1] : i + 1 : i + 1}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 500 }}>{cleanNm(l.name)}{(l as any).sourcePosId && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#a89f92' }}>{(l as any).sourcePosId}</div>}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(l.qty)}</td>
                        <td style={{ padding: '6px 4px', width: 60 }}><input style={{ ...inp, padding: '4px 6px', textAlign: 'center' }} value={l.unit || ''} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} /></td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: izd ? '#7a3aaa' : COLORS.textMuted, whiteSpace: 'nowrap' }}>{cmOf(l) ? `${cmOf(l)} см` : '—'}</td>
                        <td style={{ padding: '6px 4px', width: 96 }}>{izd
                          ? <div style={{ textAlign: 'right', fontWeight: 600, color: '#7a3aaa', padding: '4px 6px' }} title="₸/шт = см × цена за см (задаётся сверху)">{fmtMoney((Number(cmOf(l)) || 0) * (Number(l.price) || 0))}</div>
                          : <input style={{ ...inp, padding: '4px 6px', textAlign: 'right' }} type="number" value={l.price} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} title="цена за единицу" />}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(amtOf(l))}</td>
                        <td style={{ padding: '6px 4px', minWidth: 120 }}><input style={{ ...inp, padding: '4px 6px' }} value={l.comment || ''} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, comment: e.target.value } : x))} /></td>
                      </tr>
                    ) })}
                  </tbody>
                </table>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>Кол-во и склад менять нельзя (это движение склада) — правится отдельно.</div>
              </div>
            ) : (
              <div style={{ padding: 20, background: '#faf8f6' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 520 }}>
                  <div><label style={lbl}>ВСЕГО К ОПЛАТЕ</label><input style={{ ...inp, background: '#f6f3f0', fontWeight: 700 }} value={fmtMoney(total) + ' ₸'} disabled /></div>
                  <div><label style={lbl}>ОПЛАЧЕНО</label><input style={inp} type="number" value={f.paidSum} onChange={e => setF({ ...f, paidSum: e.target.value })} /></div>
                  <div><label style={lbl}>ОСТАТОК</label><input style={{ ...inp, background: '#f6f3f0', fontWeight: 700, color: remain > 0.001 ? '#b03020' : '#2e8a5e' }} value={fmtMoney(remain) + ' ₸'} disabled /></div>
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 10 }}>Свяжется с финмодулем ({isSale ? 'долг заказчика' : 'долг перед поставщиком'}) на следующем этапе.</div>
              </div>
            )}

            {/* Итоги + скидка */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: COLORS.textMuted }}>Подытог: <b style={{ color: COLORS.text }}>{fmtMoney(subtotal)} ₸</b></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: COLORS.textMuted }}>Скидка:</span>
                <input style={{ ...inp, width: 70, padding: '4px 6px', textAlign: 'right' }} type="number" value={discMode === 'pct' ? f.discountPct : f.discountSum}
                  onChange={e => setF({ ...f, [discMode === 'pct' ? 'discountPct' : 'discountSum']: e.target.value })} />
                <select style={{ ...inp, width: 60, padding: '4px 6px' }} value={discMode} onChange={e => setDiscMode(e.target.value as any)}>
                  <option value="pct">%</option><option value="sum">₸</option>
                </select>
                <span style={{ fontSize: 13, color: COLORS.textMuted }}>= {fmtMoney(discountSum)} ₸</span>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800 }}>Всего: {fmtMoney(total)} ₸</span>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1efec', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
              {flash && <span style={{ marginRight: 'auto', fontSize: 13, color: flash.startsWith('⚠') ? '#b03020' : '#2e8a5e' }}>{flash}</span>}
              {o.status !== 'cancelled' && (o.type === 'purchase' || o.type === 'sale') && <button onClick={() => setReturning(true)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6c4bf', background: '#fff', color: '#b4574c', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>↩ Вернуть</button>}
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Закрыть</button>
              <button onClick={() => save()} disabled={busy || o.status === 'cancelled'} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy || o.status === 'cancelled' ? 0.6 : 1 }}>{busy ? '…' : 'Сохранить'}</button>
              {o.status !== 'cancelled' && !f.reviewed && <button onClick={() => save(true)} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#2e8a5e', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>✓ Проверено</button>}
            </div>
          </>
        )}
      </div>
      {returning && <ReturnModal docId={id} onClose={() => setReturning(false)} onDone={() => { setReturning(false); onSaved?.() }} />}
    </div>
  )
}
