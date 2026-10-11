'use client'
import { useEffect, useMemo, useState } from 'react'
import ContragentPicker from '@/components/ContragentPicker'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { fetchRefs, listProducts } from '@/lib/api/refs'
import { createPurchase, createSale } from '@/lib/api/docs'

// Прямое создание накладной в разделе документов (без карточки-заявки).
// kind 'in' = приходная (createPurchase, контрагент = поставщик, цена по умолчанию = закуп),
// kind 'out' = расходная (createSale, контрагент = покупатель, цена по умолчанию = розница).
type Line = { productId: string; name: string; unit: string; qty: number; price: number }

export default function DocCreateForm({ kind, orgId, onClose, onSaved }: {
  kind: 'in' | 'out'; orgId: string; onClose: () => void; onSaved: () => void
}) {
  const isIn = kind === 'in'
  const [contragents, setContragents] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [cagId, setCagId] = useState('')
  const [whId, setWhId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Line[]>([])
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchRefs(orgId).then((r: any) => {
      setContragents(Array.isArray(r?.contragents) ? r.contragents : [])
      const whs = (Array.isArray(r?.warehouses) ? r.warehouses : []).filter((w: any) => w.orgId === orgId)
      setWarehouses(whs)
      const central = whs.find((w: any) => w.isCentral) || whs[0]
      if (central) setWhId(central.id)
    }).catch(() => {})
    listProducts(orgId).then((p: any) => setProducts(Array.isArray(p) ? p : [])).catch(() => {})
  }, [orgId])

  const priceOf = (p: any) => isIn ? Number(p.priceIn) || 0 : (Number(p.priceRetail) || Number(p.priceIn) || 0)

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return products.filter((p: any) => (p.name || '').toLowerCase().includes(s)).slice(0, 30)
  }, [q, products])

  function addLine(p: any) {
    setLines(ls => ls.some(l => l.productId === p.id)
      ? ls.map(l => l.productId === p.id ? { ...l, qty: l.qty + 1 } : l)
      : [...ls, { productId: p.id, name: p.name, unit: p.unit || 'шт', qty: 1, price: priceOf(p) }])
    setQ('')
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const delLine = (i: number) => setLines(ls => ls.filter((_, j) => j !== i))

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)

  async function submit() {
    setMsg('')
    if (!cagId) { setMsg('⚠ Выберите контрагента'); return }
    if (!whId) { setMsg('⚠ Нет склада'); return }
    const good = lines.filter(l => (Number(l.qty) || 0) > 0)
    if (!good.length) { setMsg('⚠ Добавьте хотя бы одну позицию'); return }
    setSaving(true)
    const body = { orgId, contragentId: cagId, warehouseId: whId, date, lines: good.map(l => ({ productId: l.productId, qty: Number(l.qty), price: Number(l.price) || 0 })) }
    const r: any = isIn ? await createPurchase(body) : await createSale(body)
    setSaving(false)
    if (r?.error || r?.ok === false) { setMsg('⚠ ' + (r.error || 'Ошибка сохранения')); return }
    onSaved(); onClose()
  }

  const title = isIn ? 'Новая приходная накладная' : 'Новая расходная накладная'
  const cagLabel = isIn ? 'Поставщик' : 'Покупатель'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '4vh 16px', zIndex: 1000, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>{cagLabel}</div>
              <ContragentPicker contragents={contragents} value={cagId} onPick={(c: any) => setCagId(c?.id || '')} placeholder={`— выберите (${cagLabel.toLowerCase()}) —`} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Склад</div>
                <select value={whId} onChange={e => setWhId(e.target.value)} style={inp}>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div style={{ width: 150 }}>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Дата</div>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Добавить товар</div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 поиск по номенклатуре…" style={inp} />
            {hits.length > 0 && (
              <div style={{ marginTop: 4, border: '1px solid #e6e2dc', borderRadius: 10, maxHeight: 240, overflowY: 'auto', background: '#fff' }}>
                {hits.map(p => (
                  <div key={p.id} onClick={() => addLine(p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f1ee', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{p.name}</span>
                    <span style={{ color: COLORS.textMuted, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtMoney(priceOf(p))} ₸</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div style={{ border: '1px solid #e6e2dc', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#faf8f6', color: COLORS.textMuted, fontSize: 11 }}>
                  {['Товар', 'Кол-во', 'Цена', 'Сумма', ''].map((h, i) => <th key={h || i} style={{ textAlign: i === 0 ? 'left' : i === 4 ? 'center' : 'right', padding: '8px 12px' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.productId} style={{ borderTop: '1px solid #f1efec' }}>
                      <td style={{ padding: '6px 12px' }}>{l.name}<span style={{ color: COLORS.textMuted }}> · {l.unit}</span></td>
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}><input type="number" value={l.qty} min={0} onChange={e => setLine(i, { qty: Number(e.target.value) })} style={numInp} /></td>
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}><input type="number" value={l.price} min={0} onChange={e => setLine(i, { price: Number(e.target.value) })} style={{ ...numInp, width: 90 }} /></td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney((Number(l.qty) || 0) * (Number(l.price) || 0))} ₸</td>
                      <td style={{ padding: '6px 12px', textAlign: 'center' }}><button onClick={() => delLine(i)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#b03020' }}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ borderTop: '2px solid #e6e2dc', background: '#faf8f6' }}>
                  <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Итого</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMoney(total)} ₸</td>
                  <td></td>
                </tr></tfoot>
              </table>
            </div>
          )}

          {msg && <div style={{ fontSize: 13, color: msg.startsWith('⚠') ? '#b03020' : COLORS.text }}>{msg}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={onClose} style={{ ...btn, background: '#f1efec', color: COLORS.text }}>Отмена</button>
            <button onClick={submit} disabled={saving} style={{ ...btn, background: COLORS.primary, color: '#fff', opacity: saving ? .6 : 1 }}>{saving ? 'Сохранение…' : (isIn ? 'Создать приход' : 'Создать расход')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e6e2dc', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }
const numInp: React.CSSProperties = { width: 70, padding: '4px 6px', border: '1px solid #e6e2dc', borderRadius: 6, fontSize: 13, textAlign: 'right' }
const btn: React.CSSProperties = { padding: '9px 18px', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
