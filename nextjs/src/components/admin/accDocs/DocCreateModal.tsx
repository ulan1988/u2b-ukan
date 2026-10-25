'use client'
// Создание печатного документа: счёт на оплату / накладная З-2 / акт Р-1 / КП.
import { useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { accDocNext, accDocCreate, accSettings } from '@/lib/api/accDocs'
import { listContragents, listProducts } from '@/lib/api/refs'
import ContragentPicker from '@/components/ContragentPicker'
import { amountInWordsKzt } from '@/dto/accDocs.dto'
import ModalShell from '@/components/admin/accDocs/ModalShell'

export const DOC_TYPES = [
  { key: 'invoice', icon: '🧾', label: 'Счёт на оплату', sub: 'Каспи / БЦК · сумма прописью' },
  { key: 'nakladnaya', icon: '📦', label: 'Накладная (З-2)', sub: 'официальная форма' },
  { key: 'akt', icon: '📝', label: 'Акт (Р-1)', sub: 'выполненных работ' },
  { key: 'kp', icon: '📄', label: 'КП', sub: 'коммерческое предложение' },
]
type Item = { name: string; sku?: string | null; qty: number; unit: string; price: number }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block' }
const fmt = (n: number) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸'
const today = () => new Date().toISOString().slice(0, 10)

export default function DocCreateModal({ type, orgId, orgName, onClose, onCreated }: { type: string; orgId: string; orgName: string; onClose: () => void; onCreated: () => void }) {
  const meta = DOC_TYPES.find(t => t.key === type)
  const [num, setNum] = useState<number | null>(null)
  const [banks, setBanks] = useState<Array<{ key: string; name: string }>>([])
  const [cags, setCags] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [f, setF] = useState({ buyerName: '', buyerBin: '', buyerAddress: '', bank: '', date: today(), withStamp: false, withSign: false })
  const [items, setItems] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    accDocNext(orgId, type).then(setNum)
    accSettings(orgId).then((s: any) => { const b = s.banks || []; setBanks(b); setF(x => ({ ...x, bank: x.bank || b[0]?.key || '' })) })
    listContragents().then(r => setCags((r as any[]).filter(c => !c.archived)))
    listProducts(orgId).then(setProducts)
  }, [orgId, type])

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/ё/g, 'е'); if (!s) return []
    const w = s.split(/\s+/)
    return products.filter(p => { const n = `${p.name} ${p.alias || ''}`.toLowerCase().replace(/ё/g, 'е'); return w.every(x => n.includes(x)) }).slice(0, 8)
  }, [q, products])
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0)
  const setItem = (i: number, p: Partial<Item>) => setItems(its => its.map((it, j) => j === i ? { ...it, ...p } : it))

  async function save() {
    if (!f.buyerName.trim()) { setErr('Укажите покупателя'); return }
    const good = items.filter(it => it.name.trim() && (Number(it.qty) || 0) > 0)
    if (!good.length) { setErr('Добавьте хотя бы одну позицию'); return }
    setBusy(true); setErr('')
    const r = await accDocCreate(orgId, {
      type, docDate: f.date, buyerName: f.buyerName.trim(), buyerBin: f.buyerBin || null, buyerAddress: f.buyerAddress || null,
      bank: type === 'invoice' ? (f.bank || null) : null, items: good, withStamp: f.withStamp, withSign: f.withSign,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Не удалось создать'); return }
    onCreated(); onClose()
  }

  return (
    <ModalShell onClose={onClose} width={760} title={<>➕ {meta?.icon} {meta?.label} <span style={{ color: '#837c72', fontWeight: 600, fontSize: 14 }}>· {orgName}</span></>}>
        {err && <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 14, fontWeight: 600 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <div><label style={lbl}>Номер</label><input style={{ ...inp, background: '#f6f3f0' }} readOnly value={num ? `№ ${num}` : '…'} /></div>
          <div><label style={lbl}>Дата</label><input style={inp} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
          {type === 'invoice' && (
            <div><label style={lbl}>Банк (счёт получателя)</label>
              <select style={inp} value={f.bank} onChange={e => setF({ ...f, bank: e.target.value })}>
                {banks.length === 0 && <option value="">— добавьте банк в «⚙ Реквизиты» —</option>}
                {banks.map(b => <option key={b.key} value={b.key}>{b.name || b.key}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={lbl}>Покупатель *</label>
          <ContragentPicker contragents={cags} value="" placeholder="— из контрагентов или впишите ниже —" onPick={(c: any) => setF(s => ({ ...s, buyerName: c.name, buyerBin: c.bin || s.buyerBin }))} />
          <input style={{ ...inp, marginTop: 6 }} value={f.buyerName} onChange={e => setF({ ...f, buyerName: e.target.value })} placeholder="название / ФИО" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
          <div><label style={lbl}>БИН / ИИН</label><input style={inp} value={f.buyerBin} onChange={e => setF({ ...f, buyerBin: e.target.value })} /></div>
          <div><label style={lbl}>Адрес</label><input style={inp} value={f.buyerAddress} onChange={e => setF({ ...f, buyerAddress: e.target.value })} /></div>
        </div>

        <div style={{ fontWeight: 800, fontSize: 14, margin: '16px 0 6px' }}>Позиции</div>
        <div style={{ position: 'relative' }}>
          <input style={inp} placeholder="🔍 Товар из номенклатуры — начните вводить" value={q} onChange={e => setQ(e.target.value)} />
          {hits.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1.5px solid #e6e2dc', borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,.16)', maxHeight: 260, overflowY: 'auto' }}>
              {hits.map(p => (
                <div key={p.id} onClick={() => { setItems(its => [...its, { name: p.name, qty: 1, unit: p.unit || 'шт', price: Number(p.priceRetail) || 0 }]); setQ('') }}
                  style={{ display: 'flex', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f4f1ed', fontSize: 14 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{p.name}</span><span style={{ color: '#837c72', whiteSpace: 'nowrap' }}>{fmt(Number(p.priceRetail) || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr style={{ fontSize: 12, color: '#5f5952', textAlign: 'left' }}><th style={{ padding: 4 }}>Наименование</th><th style={{ width: 80, padding: 4 }}>Кол-во</th><th style={{ width: 110, padding: 4 }}>Цена</th><th style={{ width: 110, padding: 4, textAlign: 'right' }}>Сумма</th><th style={{ width: 30 }} /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td style={{ padding: 3 }}><input style={inp} value={it.name} onChange={e => setItem(i, { name: e.target.value })} /></td>
                  <td style={{ padding: 3 }}><input style={{ ...inp, textAlign: 'center' }} inputMode="decimal" value={String(it.qty)} onChange={e => setItem(i, { qty: Number(e.target.value.replace(',', '.')) || 0 })} /></td>
                  <td style={{ padding: 3 }}><input style={{ ...inp, textAlign: 'right' }} inputMode="decimal" value={String(it.price)} onChange={e => setItem(i, { price: Number(e.target.value.replace(',', '.')) || 0 })} /></td>
                  <td style={{ padding: 3, textAlign: 'right', fontWeight: 700 }}>{fmt((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
                  <td style={{ padding: 3 }}><button onClick={() => setItems(its => its.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#c1121c', cursor: 'pointer', fontSize: 17 }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => setItems([...items, { name: '', qty: 1, unit: 'шт', price: 0 }])} style={{ marginTop: 6, border: '1.5px dashed #d8d3cc', background: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#5f5952' }}>＋ Строка вручную</button>
        <div style={{ textAlign: 'right', marginTop: 12, fontSize: 16 }}>Итого: <b>{fmt(total)}</b></div>
        {total > 0 && <div style={{ textAlign: 'right', fontSize: 12.5, color: '#6b7280', fontStyle: 'italic' }}>{amountInWordsKzt(total)}</div>}

        <div style={{ display: 'flex', gap: 22, marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1efec', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.withStamp} onChange={e => setF({ ...f, withStamp: e.target.checked })} /> 🔵 Печать</label>
          <label style={{ fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.withSign} onChange={e => setF({ ...f, withSign: e.target.checked })} /> ✍ Подпись</label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={save} disabled={busy} style={{ padding: '11px 22px', borderRadius: 9, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '…' : 'Создать документ'}</button>
          <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Отмена</button>
        </div>
    </ModalShell>
  )
}
