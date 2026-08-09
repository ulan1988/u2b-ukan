'use client'
// Частичный возврат по накладной: выбираешь позиции и кол-во (можно 1 шт), а не всю накладную.
// Направление авто по типу источника: приходная (закуп) → «Возврат поставщику» (return_out);
// расходная (продажа) → «Возврат от клиента» (return_in). Кабинету контрагента уходит уведомление.
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { getDocument, createReturn } from '@/lib/api/docs'

const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

export default function ReturnModal({ docId, onClose, onDone }: { docId: string; onClose: () => void; onDone?: () => void }) {
  const [data, setData] = useState<any>(null)
  const [ret, setRet] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => { getDocument(docId).then((d: any) => { setData(d); setRet({}) }) }, [docId])

  const doc = data?.doc
  const lines = (data?.lines || []) as any[]
  const isReturnDoc = doc && (doc.type === 'return_in' || doc.type === 'return_out')
  const kind: 'in' | 'out' = doc?.type === 'purchase' ? 'out' : 'in'   // закуп → поставщику; продажа → от клиента
  const dirLabel = kind === 'out' ? 'Возврат ПОСТАВЩИКУ' : 'Возврат ОТ КЛИЕНТА'
  // Позиция в возврате = есть ключ в ret (галочка отмечена). Без галочки — не возвращаем.
  const rows = lines.map(l => ({ ...l, on: l.id in ret, retN: Math.min(Number(ret[l.id] || 0), Number(l.qty)) }))
  const totalRet = rows.reduce((s, r) => s + (r.on ? r.retN : 0) * Number(r.price || 0), 0)
  const anyRet = rows.some(r => r.on && r.retN > 0)
  const toggle = (l: any) => setRet(s => { const n = { ...s }; if (l.id in n) delete n[l.id]; else n[l.id] = String(Number(l.qty)); return n })

  async function submit() {
    if (!anyRet) { setFlash('⚠ Укажите кол-во возврата хотя бы по одной позиции'); return }
    setBusy(true)
    const r: any = await createReturn(kind, {
      orgId: doc.orgId, contragentId: doc.contragentId, warehouseId: doc.warehouseId,
      comment: `Возврат по ${doc.number}${reason ? ' · ' + reason : ''}`,
      lines: rows.filter(x => x.on && x.retN > 0).map(x => ({ productId: x.productId, qty: x.retN, price: Number(x.price) || 0, unit: x.unit || 'шт' })),
    })
    setBusy(false)
    // createReturn отдаёт обёртку { ok, data, error } (http.send)
    if (r?.ok && (r.data?.id || r.data?.number)) { onDone?.(); onClose() }
    else setFlash('⚠ ' + (r?.error || 'Ошибка возврата'))
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="anim-pop" style={{ width: 640, maxWidth: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,.25)', overflow: 'hidden' }}>
        {!data ? <div style={{ padding: 44, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : isReturnDoc ? (
          <div style={{ padding: 28 }}><div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Это уже возврат</div><div style={{ color: COLORS.textMuted, fontSize: 14, marginBottom: 16 }}>Возврат делается по приходной или расходной накладной.</div><button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Закрыть</button></div>
        ) : (
          <>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#b4574c' }}>↩ {dirLabel}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.primary }}>по {doc.number}</span>
              <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>
            <div style={{ padding: '10px 20px', fontSize: 13, color: COLORS.textMuted }}>Контрагент: <b style={{ color: COLORS.text }}>{data.contragent?.name || '—'}</b>. Отметь <b>только те позиции</b>, что возвращаешь, и укажи кол-во (можно 1 шт). Неотмеченные — не возвращаются.</div>
            <div style={{ padding: '0 20px 8px', maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ color: COLORS.textMuted, fontSize: 11 }}>{['', 'Товар', 'Было', 'Цена', 'Вернуть', 'Сумма'].map((h, i) => <th key={i} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid #f1efec', background: l.on ? '#fff8f6' : 'transparent', opacity: l.on ? 1 : 0.6 }}>
                      <td style={{ padding: '7px 8px', width: 28 }}><input type="checkbox" checked={l.on} onChange={() => toggle(l)} style={{ cursor: 'pointer', width: 16, height: 16 }} /></td>
                      <td style={{ padding: '7px 8px', fontWeight: 500 }}>{l.name}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{Number(l.qty)} {l.unit}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtMoney(Number(l.price))}</td>
                      <td style={{ padding: '7px 8px', width: 90 }}>
                        <input type="number" min={0} max={Number(l.qty)} disabled={!l.on} value={l.on ? (ret[l.id] ?? '') : ''} placeholder="0"
                          onChange={e => { const v = Math.max(0, Math.min(Number(e.target.value) || 0, Number(l.qty))); setRet(s => ({ ...s, [l.id]: String(v) })) }}
                          style={{ ...inp, padding: '5px 7px', textAlign: 'right', borderColor: l.on && l.retN > 0 ? '#b4574c' : '#e6e2dc', background: l.on ? '#fff' : '#f6f3f0' }} />
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.on && l.retN > 0 ? fmtMoney(l.retN * Number(l.price || 0)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10 }}><label style={{ fontSize: 12, fontWeight: 700, color: '#5f5952' }}>ПРИЧИНА (необязательно)</label><input style={{ ...inp, marginTop: 4 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="брак, пересорт, отказ…" /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14 }}>К возврату: <b style={{ color: '#b4574c' }}>{fmtMoney(totalRet)} ₸</b></span>
              {flash && <span style={{ fontSize: 13, color: '#b03020' }}>{flash}</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
                <button onClick={submit} disabled={busy || !anyRet} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#b4574c', color: '#fff', cursor: busy || !anyRet ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy || !anyRet ? 0.6 : 1 }}>↩ Оформить возврат</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
