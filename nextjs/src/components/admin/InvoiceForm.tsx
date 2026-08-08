'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { getDocument, updateDocument } from '@/lib/api/docs'

// Форма приходной накладной (1С УНФ). Открывается из списка «Приходные накладные».
// Правим «бумажные» поля: вх.номер/дата, операция, скидка, оплата, коммент + цена/ед./коммент строк.
// Кол-во/склад менять нельзя (это движение склада — отдельный шаг).
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#5f5952', marginBottom: 3, display: 'block', letterSpacing: '.03em' }
const OPS = [{ v: 'receipt', l: 'Поступление от поставщика' }, { v: 'return', l: 'Возврат поставщику' }]

export default function InvoiceForm({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved?: () => void }) {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState<'goods' | 'pay'>('goods')
  const [f, setF] = useState<any>({})            // редактируемая шапка
  const [lines, setLines] = useState<any[]>([])  // редактируемые строки
  const [discMode, setDiscMode] = useState<'pct' | 'sum'>('pct')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => { getDocument(id).then((d: any) => {
    if (!d) return
    setData(d)
    setF({ number: d.doc.number || '', date: d.doc.date ? String(d.doc.date).slice(0, 10) : '', inNumber: d.doc.inNumber || '', inDate: d.doc.inDate || '', operation: d.doc.operation || 'receipt', comment: d.doc.comment || '', discountPct: Number(d.doc.discountPct) || 0, discountSum: Number(d.doc.discountSum) || 0, paidSum: Number(d.doc.paidSum) || 0 })
    setLines((d.lines || []).map((l: any) => ({ ...l, price: Number(l.price), qty: Number(l.qty) })))
  }) }, [id])

  const subtotal = lines.reduce((s, l) => s + l.qty * (Number(l.price) || 0), 0)
  const discountSum = discMode === 'pct' ? Math.round(subtotal * (Number(f.discountPct) || 0)) / 100 : (Number(f.discountSum) || 0)
  const total = Math.max(0, subtotal - discountSum)
  const remain = total - (Number(f.paidSum) || 0)

  async function save() {
    setBusy(true)
    const patch: any = {
      number: f.number, date: f.date || undefined, inNumber: f.inNumber, inDate: f.inDate || null, operation: f.operation, comment: f.comment, paidSum: Number(f.paidSum) || 0,
      lines: lines.map(l => ({ id: l.id, price: Number(l.price) || 0, unit: l.unit, comment: l.comment })),
    }
    if (discMode === 'pct') patch.discountPct = Number(f.discountPct) || 0
    else patch.discountSum = Number(f.discountSum) || 0
    const r: any = await updateDocument(id, patch)
    setBusy(false)
    if (r.ok !== false) { setFlash('✓ Сохранено'); setTimeout(() => setFlash(''), 1500); onSaved?.() }
    else setFlash('⚠ ' + (r.error || 'Ошибка'))
  }

  const o = data?.doc
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="anim-pop" style={{ width: 820, maxWidth: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        {!data ? <div style={{ padding: 48, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : (
          <>
            {/* Шапка */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>Приходная накладная</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.primary }}>{o.number}</span>
              <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: o.status === 'cancelled' ? '#faeaea' : '#e8f5ee', color: o.status === 'cancelled' ? '#b03020' : '#2e8a5e', fontWeight: 700 }}>{o.status === 'cancelled' ? 'отменён' : 'проведён'}</span>
              <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>

            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div><label style={lbl}>НОМЕР (авто, можно менять)</label><input style={inp} value={f.number} onChange={e => setF({ ...f, number: e.target.value })} /></div>
              <div><label style={lbl}>ДАТА (день приёмки)</label><input style={inp} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
              <div><label style={lbl}>ПОСТАВЩИК</label><input style={{ ...inp, background: '#f6f3f0' }} value={data.contragent?.name || '—'} disabled /></div>
              <div><label style={lbl}>СКЛАД</label><input style={{ ...inp, background: '#f6f3f0' }} value={data.warehouse?.name || '—'} disabled /></div>
              <div><label style={lbl}>ВХ. НОМЕР</label><input style={inp} value={f.inNumber} onChange={e => setF({ ...f, inNumber: e.target.value })} placeholder="№ накладной поставщика" /></div>
              <div><label style={lbl}>ВХ. ДАТА</label><input style={inp} type="date" value={f.inDate ? String(f.inDate).slice(0, 10) : ''} onChange={e => setF({ ...f, inDate: e.target.value })} /></div>
              <div><label style={lbl}>ОПЕРАЦИЯ</label><select style={inp} value={f.operation} onChange={e => setF({ ...f, operation: e.target.value })}>{OPS.map(op => <option key={op.v} value={op.v}>{op.l}</option>)}</select></div>
              <div><label style={lbl}>ОСНОВАНИЕ (ЗАЯВКА)</label><input style={{ ...inp, background: '#f6f3f0', fontFamily: "'JetBrains Mono', monospace", color: COLORS.primary }} value={o.sourceOrderId || '—'} disabled title="id карточки-основания" /></div>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ color: COLORS.textMuted, fontSize: 11 }}>{['№', 'Номенклатура', 'Кол-во', 'Ед.', 'Цена', 'Сумма', 'Коммент'].map((h, i) => <th key={h} style={{ textAlign: i >= 2 && i <= 5 ? 'right' : 'left', padding: '4px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.id} style={{ borderTop: '1px solid #efece8' }}>
                        <td style={{ padding: '6px 8px', color: COLORS.textMuted }}>{i + 1}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 500 }}>{l.name}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(l.qty)}</td>
                        <td style={{ padding: '6px 4px', width: 60 }}><input style={{ ...inp, padding: '4px 6px', textAlign: 'center' }} value={l.unit || ''} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} /></td>
                        <td style={{ padding: '6px 4px', width: 90 }}><input style={{ ...inp, padding: '4px 6px', textAlign: 'right' }} type="number" value={l.price} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} /></td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(l.qty * (Number(l.price) || 0))}</td>
                        <td style={{ padding: '6px 4px', minWidth: 120 }}><input style={{ ...inp, padding: '4px 6px' }} value={l.comment || ''} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, comment: e.target.value } : x))} /></td>
                      </tr>
                    ))}
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
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 10 }}>Свяжется с финмодулем (долг перед поставщиком) на следующем этапе.</div>
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
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Закрыть</button>
              <button onClick={save} disabled={busy || o.status === 'cancelled'} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy || o.status === 'cancelled' ? 0.6 : 1 }}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
