'use client'
// Рабочий стол мастера производства. Заказчик + цена за см, таблица изделий
// (№ / номенклатура / цвет / см / шт / тг за шт / сумма / ✕ клон), расчёт материала
// (см ÷ 125 = листов). «Выполнено» → карточка уходит из стола обратно в «Заказы на
// производство» (готова к логисту). Прямой заказ (без карточки) — «Создать карточку».
import { useState } from 'react'
import ContragentPicker from '@/components/ContragentPicker'
import NomInline from '@/components/NomInline'
import NomPicker, { PickedPos } from '@/components/NomPicker'
import { extractRal, RalDot } from '@/lib/ral'
import { packByColor, SHEET_WIDTH_CM } from '@/lib/production'
import { updatePosition, addPosition, deletePosition, orderAction, createClientOrder } from '@/lib/api/orders'

const PRIMARY = '#d4613a'
interface Row { id?: string; productId: string; name: string; color: string; cm: string; qty: string; price: string }
const inp: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

function rowFromPos(p: any): Row {
  return { id: p.id, productId: p.productId || '', name: p.name1c || p.oral || '', color: extractRal(p.name1c || p.oral || ''), cm: p.widthCm ? String(p.widthCm) : '', qty: String(Number(p.qty) || 1), price: p.price != null ? String(Number(p.price)) : '' }
}

export default function ProductionWorkbench({ order, contragents, products, onDone, showMsg }: {
  order: any | null; contragents: any[]; products: any[]; onDone: () => void; showMsg: (m: string) => void
}) {
  const [cid, setCid] = useState(order?.contactId || '')
  const [priceCm, setPriceCm] = useState('')
  const [rows, setRows] = useState<Row[]>(() => order?.positions?.length ? order.positions.map(rowFromPos) : [blank()])
  const [busy, setBusy] = useState(false)
  const [catalog, setCatalog] = useState(false)
  function blank(): Row { return { productId: '', name: '', color: '', cm: '', qty: '1', price: '' } }
  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))

  // Выбор из каталога-модельки (NomPicker) → строки стола. Цвет и «· NN см» тянутся из имени.
  function addFromCatalog(items: PickedPos[]) {
    const add: Row[] = items.map(it => {
      const nm = (it.name1c || it.oral || '').trim()
      const cmM = nm.match(/(\d+)\s*см/)
      const clean = nm.replace(/\s*·?\s*\d+\s*см\s*$/, '').trim() || nm
      return { productId: '', name: clean, color: extractRal(clean), cm: cmM ? cmM[1] : '', qty: String(it.qty || 1), price: '' }
    })
    setRows(rs => [...rs.filter(r => r.name || r.productId || r.cm), ...add])
    setCatalog(false)
  }
  // тг за шт = цена_за_см × см (если заданы), иначе ручная цена
  const piecePrice = (r: Row) => { const auto = (Number(priceCm) || 0) * (Number(r.cm) || 0); return auto > 0 ? auto : (Number(r.price) || 0) }
  const rowSum = (r: Row) => (Number(r.qty) || 0) * piecePrice(r)
  const totalCm = rows.reduce((s, r) => s + (Number(r.cm) || 0) * (Number(r.qty) || 0), 0)
  // Цвет берём из изделия (extractRal). Раскрой ОТДЕЛЬНО по каждому цвету — лист одного
  // цвета нельзя резать под изделие другого.
  const pack = packByColor(rows.map(r => ({ color: r.color || extractRal(r.name), cm: Number(r.cm) || 0, qty: Number(r.qty) || 0 })))
  const grand = rows.reduce((s, r) => s + rowSum(r), 0)
  const valid = rows.some(r => (r.name || r.productId) && Number(r.qty) > 0)

  // Синхронизировать строки → позиции существующей карточки (плечо-заказ).
  async function syncPositions(cardId: string) {
    const keep = new Set<string>()
    for (const r of rows) {
      if (!(r.name || r.productId) || !(Number(r.qty) > 0)) continue
      const name = `${r.name}${r.color && !r.name.includes(r.color) ? ' ' + r.color : ''}`
      const body: any = { name1c: name, oral: name, qty: Number(r.qty), unit: 'шт', price: Math.round(piecePrice(r)), productId: r.productId || undefined, widthCm: Number(r.cm) || undefined }
      if (r.id) { await updatePosition(cardId, r.id, body); keep.add(r.id) }
      else { const res: any = await addPosition(cardId, body); if (res?.data?.position?.id) keep.add(res.data.position.id) }
    }
    // удалить убранные мастером позиции
    for (const p of (order?.positions || [])) if (!keep.has(p.id) && !rows.some(r => r.id === p.id)) { try { await deletePosition(cardId, p.id) } catch {} }
  }

  async function done() {
    if (!valid) { showMsg('Добавьте хотя бы одну позицию'); return }
    setBusy(true)
    try {
      if (order?.id) { await syncPositions(order.id); await orderAction(order.id, 'produceDone'); showMsg('✓ Изготовлено — в «Заказы на производство»') }
      else {
        // Прямой заказ: создаём карточку сразу изготовленной (готова к логисту)
        const positions = rows.filter(r => (r.name || r.productId) && Number(r.qty) > 0).map(r => { const name = `${r.name}${r.color && !r.name.includes(r.color) ? ' ' + r.color : ''}`; return { name1c: name, oral: name, qty: Number(r.qty), unit: 'шт', price: Math.round(piecePrice(r)) } })
        const res: any = await createClientOrder({ comment: 'Прямой заказ на производство', positions })
        if (res?.ok && res.data?.id) { await orderAction(res.data.id, 'produceDone'); showMsg('✓ Карточка создана и изготовлена') }
        else { showMsg('⚠ ' + (res?.error || 'Не удалось создать')); setBusy(false); return }
      }
      onDone()
    } catch { showMsg('⚠ Ошибка') } finally { setBusy(false) }
  }

  const th: React.CSSProperties = { padding: '6px 6px', fontSize: 11, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }
  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>🔧 {order?.id || 'Прямой заказ'}</span>
        <span style={{ fontSize: 11, background: '#f3eeff', color: '#7a3aaa', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>Производство</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>ЗАКАЗЧИК</label>
          <ContragentPicker contragents={contragents} value={cid} onPick={(c: any) => setCid(c.id)} placeholder="— контрагент —" />
        </div>
        <div style={{ width: 130 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>ЦЕНА ЗА СМ</label>
          <input style={inp} type="number" value={priceCm} onChange={e => setPriceCm(e.target.value)} placeholder="тг/см" />
        </div>
      </div>

      {/* Раскрой — сверху: минимальное число листов, ОТДЕЛЬНО по каждому цвету листа */}
      {pack.totalSheets > 0 && (
        <div style={{ background: '#eef7f1', border: '1.5px solid #cfeadd', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>
            📐 Нужно листов: <b style={{ color: '#2e8a5e', fontSize: 18 }}>{pack.totalSheets}</b> <span style={{ color: '#837c72', fontSize: 12 }}>(по {SHEET_WIDTH_CM} см)</span>
            {pack.byColor.length > 1 && <span style={{ color: '#837c72', fontSize: 12 }}> · {pack.byColor.length} цвета — считаются отдельно</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {pack.byColor.map(g => {
              const d: Record<number, number> = {}; for (const rm of g.remainders) d[rm] = (d[rm] || 0) + 1
              const rd = Object.entries(d).sort((a, b) => Number(a[0]) - Number(b[0]))
              return (
                <div key={g.color} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <RalDot code={g.color} /><b style={{ minWidth: 44 }}>{g.color}</b>
                  <span><b style={{ color: '#2e8a5e' }}>{g.sheets}</b> лист · обрезь {g.wasteCm} см</span>
                  {rd.length > 0 && <span style={{ color: '#837c72' }}>остатки: {rd.map(([cm, n]) => `${cm}см×${n}`).join(', ')}</span>}
                  {g.oversize > 0 && <span style={{ color: '#b03020', fontWeight: 700 }}>⚠ {g.oversize} шире листа</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr style={{ background: '#f8f6f3' }}>
            <th style={th}>№</th><th style={{ ...th, minWidth: 150 }}>НОМЕНКЛАТУРА (цвет)</th><th style={{ ...th, textAlign: 'right' }}>СМ</th><th style={{ ...th, textAlign: 'right' }}>ШТ</th><th style={{ ...th, textAlign: 'right' }}>ТГ/ШТ</th><th style={{ ...th, textAlign: 'right' }}>СУММА</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1efec' }}>
                <td style={{ padding: '4px 6px', fontSize: 12, color: '#837c72' }}>{i + 1}</td>
                <td style={{ padding: '4px 4px', minWidth: 150 }}><NomInline products={products} value={r.productId} name={r.name} onPick={(p: any) => setRow(i, { productId: p.id, name: p.name, color: extractRal(p.name) })} /></td>
                <td style={{ padding: '4px 4px', width: 64 }}><input style={{ ...inp, width: 58, textAlign: 'right' }} type="number" value={r.cm} onChange={e => setRow(i, { cm: e.target.value })} placeholder="см" /></td>
                <td style={{ padding: '4px 4px', width: 56 }}><input style={{ ...inp, width: 50, textAlign: 'right' }} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></td>
                <td style={{ padding: '4px 4px', width: 80, textAlign: 'right', fontSize: 13 }}>{piecePrice(r) ? Math.round(piecePrice(r)).toLocaleString('ru-RU') : <input style={{ ...inp, width: 70, textAlign: 'right' }} type="number" value={r.price} onChange={e => setRow(i, { price: e.target.value })} placeholder="цена" />}</td>
                <td style={{ padding: '4px 6px', width: 90, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{rowSum(r) ? Math.round(rowSum(r)).toLocaleString('ru-RU') : '—'}</td>
                <td style={{ padding: '4px 4px', width: 46, whiteSpace: 'nowrap' }}>
                  <button onClick={() => setRows(rs => [...rs.slice(0, i + 1), { ...r, id: undefined }, ...rs.slice(i + 1)])} title="Клонировать" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>📋</button>
                  <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} title="Удалить" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#c1121c' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setCatalog(true)} style={{ border: 'none', borderRadius: 8, padding: '7px 16px', background: PRIMARY, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>📖 Каталог</button>
        <button onClick={() => setRows(rs => [...rs, blank()])} style={{ border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '5px 14px', background: 'none', cursor: 'pointer', fontSize: 13, color: '#5f5952', fontFamily: 'inherit' }}>＋ Пустая строка</button>
      </div>
      {catalog && <NomPicker onPick={addFromCatalog} onClose={() => setCatalog(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1efec', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5f5952' }}>Листов: <b style={{ color: '#26231f' }}>{pack.totalSheets}</b> · всего {totalCm} см</span>
        <span style={{ fontSize: 13 }}>Итого: <b>{Math.round(grand).toLocaleString('ru-RU')} ₸</b></span>
        <button onClick={done} disabled={busy || !valid} style={{ marginLeft: 'auto', padding: '9px 20px', borderRadius: 8, border: 'none', background: valid ? '#2e8a5e' : '#e6e2dc', color: '#fff', cursor: valid ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '...' : (order?.id ? '✓ Выполнено' : '✓ Создать карточку')}</button>
      </div>
    </div>
  )
}
