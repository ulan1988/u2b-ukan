'use client'
// Рабочий стол мастера производства. Заказчик + цена за см, таблица изделий
// (№ / номенклатура / цвет / см / шт / тг за шт / сумма / ✕ клон), расчёт материала
// (см ÷ 125 = листов). «Выполнено» → карточка уходит из стола обратно в «Заказы на
// производство» (готова к логисту). Прямой заказ (без карточки) — «Создать карточку».
import { useState, useRef, useEffect } from 'react'
import ContragentPicker from '@/components/ContragentPicker'
import NomInline from '@/components/NomInline'
import NomPicker, { PickedPos } from '@/components/NomPicker'
import { extractRal, RalDot, ralOrdered } from '@/lib/ral'
import { overlayFor, NomItem } from '@/lib/nomTree'
import { updatePosition, addPosition, deletePosition, orderAction, createClientOrder } from '@/lib/api/orders'
import { itemName } from '@/lib/itemName'

const PRIMARY = '#d4613a'
interface Row { id?: string; productId: string; name: string; color: string; cm: string; qty: string; price: string }
const inp: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

function rowFromPos(p: any): Row {
  return { id: p.id, productId: p.productId || '', name: p.name1c || p.oral || '', color: extractRal(p.name1c || p.oral || ''), cm: p.widthCm ? String(p.widthCm) : '', qty: String(Number(p.qty) || 1), price: p.price != null ? String(Number(p.price)) : '' }
}

export default function ProductionWorkbench({ order, uid, contragents, products, specProjects = [], onDone, showMsg }: {
  order: any | null; uid?: string; contragents: any[]; products: any[]; specProjects?: any[]; onDone: () => void; showMsg: (m: string) => void
}) {
  const [cid, setCid] = useState(order?.contactId || '')
  const [specProjectId, setSpecProjectId] = useState(order?.specProjectId || '')
  const [priceCm, setPriceCm] = useState('')
  // Проекты выбранного заказчика (Автор = clientId). Нет заказчика/проектов — список пуст.
  const clientProjects = (specProjects || []).filter((sp: any) => cid && sp.clientId === cid)
  const [rows, setRows] = useState<Row[]>(() => order?.positions?.length ? order.positions.map(rowFromPos) : [blank()])
  const [busy, setBusy] = useState(false)
  const [catalog, setCatalog] = useState(false)
  const [qColor, setQColor] = useState('')                 // наружная моделька: выбранный цвет
  const [allColors, setAllColors] = useState(false)        // показать все цвета (глазок)
  const [qKind, setQKind] = useState('')                   // …и вид из «Комплектующие»
  const [qCm, setQCm] = useState('')                       // длина для «Изделие · см»
  const [qQty, setQQty] = useState('1')                    // кол-во для быстрого добавления
  const cmRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const advRef = useRef<any>(null)   // таймер авто-перехода на след. ячейку (пауза после набора)
  function blank(): Row { return { productId: '', name: '', color: '', cm: '', qty: '1', price: '' } }
  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  // Автоцена по типу клиента (опт/розница) — как на головном: после настройки цены товара подтянется сама.
  const clientPT = (contragents.find((c: any) => c.id === cid)?.priceType) || 'retail'
  const priceForClient = (p: any, pt: string = clientPT) => Number((pt === 'opt' ? p?.priceOpt : p?.priceRetail)) || 0

  // Наружная моделька: сверху цвета, снизу виды из папки «Комплектующие» (Изделие/Нар.угол/H-профиль).
  const ACC = overlayFor('комплектующие')[0]?.items || []
  const accKind = ACC.find(k => k.key === qKind)
  const inCompl = (p: any) => `${p.group || ''} ${p.cat || ''}`.toLowerCase().includes('комплект')
  const norm = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е')
  function findProd(kind: NomItem, colorCode: string) {
    const words = kind.terms ?? [kind.label]
    return products.filter(inCompl).filter(p => {
      const n = norm(p.name)
      if (!words.every(w => n.includes(norm(w)))) return false
      if (!colorCode) return true
      return colorCode === 'decor' ? /дерев|дуб|3d/i.test(p.name) : extractRal(p.name) === colorCode
    }).sort((a, b) => a.name.length - b.name.length)[0]
  }
  // Авто-фокус на «Длину», как только выбран вид с размером — сразу набирай см.
  useEffect(() => { if (accKind?.measure) setTimeout(() => cmRef.current?.focus(), 0) }, [qKind])   // eslint-disable-line react-hooks/exhaustive-deps
  function addQuick() {
    if (!accKind) return
    const prod = findProd(accKind, qColor)
    const base = prod?.name || accKind.terms?.[0] || accKind.label
    // Имя строки собираем сразу по формуле «вид + цвет + см» (видно в таблице)
    const name = itemName({ name: base, color: qColor, cm: accKind.measure ? qCm : '' })
    const qty = Math.max(1, Number(qQty) || 1)
    const row: Row = { productId: prod?.id || '', name, color: qColor === 'decor' ? 'decor' : (qColor || extractRal(name)), cm: accKind.measure ? qCm : '', qty: String(qty), price: '' }
    setRows(rs => [...rs.filter(r => r.name || r.productId || r.cm), row])
    setQCm(''); setQQty('1')
    if (accKind.measure) setTimeout(() => cmRef.current?.focus(), 0)
  }

  // Выбор из каталога-модельки (NomPicker) → строки стола. Цвет и «· NN см» тянутся из имени.
  function addFromCatalog(items: PickedPos[]) {
    const add: Row[] = items.map(it => {
      const nm = (it.name1c || it.oral || '').trim()
      const cmM = nm.match(/(\d+)\s*см/)
      const clean = nm.replace(/\s*·?\s*\d+\s*см\s*$/, '').trim() || nm
      return { productId: '', name: clean, color: extractRal(clean), cm: it.widthCm != null ? String(it.widthCm) : (cmM ? cmM[1] : ''), qty: String(it.qty || 1), price: '' }
    })
    setRows(rs => [...rs.filter(r => r.name || r.productId || r.cm), ...add])
    setCatalog(false)
  }
  // тг за шт = цена_за_см × см (если заданы), иначе ручная цена
  const piecePrice = (r: Row) => { const auto = (Number(priceCm) || 0) * (Number(r.cm) || 0); return auto > 0 ? auto : (Number(r.price) || 0) }
  const rowSum = (r: Row) => (Number(r.qty) || 0) * piecePrice(r)
  const totalCm = rows.reduce((s, r) => s + (Number(r.cm) || 0) * (Number(r.qty) || 0), 0)
  const grand = rows.reduce((s, r) => s + rowSum(r), 0)
  const hasPos = rows.some(r => (r.name || r.productId) && Number(r.qty) > 0)
  const needCustomer = !order?.id                 // прямой заказ обязан иметь заказчика
  // Изделия без цены уходили в карточку по 0 ₸ — выручка и рентабельность по ним обнулялись.
  // Цена = «за см × см» либо ручная; строка без цены блокирует создание карточки.
  const filled = (r: Row) => (r.name || r.productId) && Number(r.qty) > 0
  const noPrice = rows.filter(r => filled(r) && !(piecePrice(r) > 0))
  const valid = hasPos && (!needCustomer || !!cid) && noPrice.length === 0

  // Синхронизировать строки → позиции существующей карточки (плечо-заказ).
  async function syncPositions(cardId: string) {
    const keep = new Set<string>()
    for (const r of rows) {
      if (!(r.name || r.productId) || !(Number(r.qty) > 0)) continue
      const name = itemName(r)
      const body: any = { name1c: name, oral: name, qty: Number(r.qty), unit: 'шт', price: Math.round(piecePrice(r)), productId: r.productId || undefined, widthCm: Number(r.cm) || undefined }
      if (r.id) { await updatePosition(cardId, r.id, body); keep.add(r.id) }
      else { const res: any = await addPosition(cardId, body); if (res?.data?.position?.id) keep.add(res.data.position.id) }
    }
    // удалить убранные мастером позиции
    for (const p of (order?.positions || [])) if (!keep.has(p.id) && !rows.some(r => r.id === p.id)) { try { await deletePosition(cardId, p.id) } catch {} }
  }

  async function done() {
    if (!hasPos) { showMsg('Добавьте хотя бы одну позицию'); return }
    if (needCustomer && !cid) { showMsg('Выберите заказчика — без него карточку создать нельзя'); return }
    if (noPrice.length) { showMsg(`Укажите цену: ${noPrice.map(r => r.name || 'позиция').join(', ')}`); return }
    setBusy(true)
    try {
      if (order?.id) { await syncPositions(order.id); await orderAction(order.id, 'produceStart'); showMsg('✓ Обновлено') }
      else {
        // Прямой заказ: создаём карточку сразу изготовленной (готова к логисту)
        const positions = rows.filter(r => (r.name || r.productId) && Number(r.qty) > 0).map(r => { const name = itemName(r); return { name1c: name, oral: name, qty: Number(r.qty), unit: 'шт', price: Math.round(piecePrice(r)), productId: r.productId || undefined, widthCm: Number(r.cm) || undefined } })
        const res: any = await createClientOrder({ comment: 'Прямой заказ на производство', prodOrder: true, contactId: cid, specProjectId: specProjectId || undefined, positions }, uid)
        if (res?.ok && res.data?.id) {
          // Если приём не прошёл — карточка осталась с пустым prod_phase. Она видна во вкладке
          // «Заказы на производство» (leg=1), мастер примет её вручную; молчать нельзя.
          const acc: any = await orderAction(res.data.id, 'produceAccept')
          showMsg(acc?.ok === false
            ? `⚠ Карточка ${res.data.id} создана, но не принята — примите во вкладке «Заказы на производство»`
            : '✓ Заказ создан — к выполнению')
        }
        else { showMsg('⚠ ' + (res?.error || 'Не удалось создать')); setBusy(false); return }
      }
      onDone()
    } catch { showMsg('⚠ Ошибка') } finally { setBusy(false) }
  }

  const th: React.CSSProperties = { padding: '6px 6px', fontSize: 11, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }
  const qpill = (on: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: on ? PRIMARY : '#f1efec', color: on ? '#fff' : '#4a4640' })
  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>🔧 {order?.id || 'Прямой заказ'}</span>
        <span style={{ fontSize: 11, background: '#f3eeff', color: '#7a3aaa', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{order ? (order.status || 'К выполнению') : 'Новый заказ'}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>ЗАКАЗЧИК {needCustomer && <span style={{ color: '#c1121c' }}>*</span>}</label>
          <div style={{ borderRadius: 8, boxShadow: needCustomer && !cid ? '0 0 0 1.5px #e6a6a6' : 'none' }}>
            <ContragentPicker contragents={contragents} value={cid} onPick={(c: any) => { setCid(c.id); setSpecProjectId(''); const pt = c.priceType || 'retail'; setRows(rs => rs.map(r => { const pr = r.productId ? priceForClient(products.find((x: any) => x.id === r.productId), pt) : 0; return pr > 0 ? { ...r, price: String(pr) } : r })) }} placeholder="— выберите заказчика —" />
          </div>
          {needCustomer && !cid && <div style={{ fontSize: 11, color: '#c1121c', marginTop: 3 }}>Обязательно — без заказчика карточку не создать</div>}
        </div>
        {/* Проекты заказчика — появляются при выборе клиента, если у него есть проекты */}
        {cid && clientProjects.length > 0 && (
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>📁 ПРОЕКТ ЗАКАЗЧИКА</label>
            <select value={specProjectId} onChange={e => setSpecProjectId(e.target.value)} style={{ ...inp, height: 34 }}>
              <option value="">— без проекта —</option>
              {clientProjects.map((sp: any) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ width: 130 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>ЦЕНА ЗА СМ</label>
          <input style={inp} type="number" value={priceCm} onChange={e => setPriceCm(e.target.value)} placeholder="тг/см" />
        </div>
      </div>

      {/* Наружная моделька: сверху цвета, снизу виды из папки «Комплектующие» (Изделие/Нар.угол/H-профиль) */}
      <div style={{ border: '1.5px solid #ece8e2', borderRadius: 12, padding: 12, marginBottom: 10, background: '#fcfbf9' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em', marginBottom: 8 }}>ЦВЕТ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 12, alignItems: 'flex-start' }}>
          {ralOrdered(allColors).map(c => {
            const on = qColor === c.code
            return (
              <button key={c.code} type="button" onClick={() => setQColor(on ? '' : c.code)} title={`${c.code} · ${c.name}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: 38 }}>
                <span style={{ width: on ? 32 : 26, height: on ? 32 : 26, borderRadius: '50%', background: c.bg || c.hex, boxShadow: on ? '0 0 0 3px rgba(212,97,58,.3), inset 0 0 0 1.5px rgba(0,0,0,.12)' : 'inset 0 0 0 1.5px rgba(0,0,0,.14)', transition: 'all .12s' }} />
                <span style={{ fontSize: 9, fontWeight: on ? 800 : 500, color: on ? PRIMARY : '#6b645b' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
              </button>
            )
          })}
          <button type="button" onClick={() => setAllColors(v => !v)} title={allColors ? 'Скрыть' : 'Показать все цвета'}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: 38 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#f1efec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,.1)' }}>{allColors ? '🙈' : '👁'}</span>
            <span style={{ fontSize: 9, color: '#6b645b' }}>{allColors ? 'скрыть' : 'ещё'}</span>
          </button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em', marginBottom: 8 }}>КОМПЛЕКТУЮЩИЕ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {ACC.map(k => <button key={k.key} type="button" onClick={() => setQKind(qKind === k.key ? '' : k.key)} style={qpill(qKind === k.key)}>{k.label}</button>)}
        </div>
        {accKind && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {accKind.measure && <>
              <span style={{ fontSize: 13, color: '#5f5952' }}>Длина:</span>
              <input ref={cmRef} style={{ ...inp, width: 74, textAlign: 'center' }} inputMode="numeric" value={qCm}
                onChange={e => setQCm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (advRef.current) clearTimeout(advRef.current); qtyRef.current?.focus(); qtyRef.current?.select() } }}
                placeholder="см" />
              <span style={{ fontSize: 13, color: '#5f5952' }}>см ×</span>
            </>}
            <input ref={qtyRef} style={{ ...inp, width: 56, textAlign: 'center' }} inputMode="numeric" value={qQty}
              onChange={e => setQQty(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuick() } }}
              placeholder="шт" />
            <button type="button" onClick={addQuick} style={{ border: 'none', borderRadius: 8, padding: '7px 16px', background: '#2e8a5e', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>＋ Добавить{qColor ? ` · ${qColor === 'decor' ? 'дерево' : qColor}` : ''}</button>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr style={{ background: '#f8f6f3' }}>
            <th style={th}>№</th><th style={{ ...th, minWidth: 150 }}>НОМЕНКЛАТУРА (цвет)</th><th style={{ ...th, textAlign: 'right' }}>СМ</th><th style={{ ...th, textAlign: 'right' }}>ШТ</th><th style={{ ...th, textAlign: 'right' }}>ТГ/ШТ</th><th style={{ ...th, textAlign: 'right' }}>СУММА</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1efec' }}>
                <td style={{ padding: '4px 6px', fontSize: 12, color: '#837c72' }}>{i + 1}</td>
                <td style={{ padding: '4px 4px', minWidth: 150 }}><NomInline products={products} value={r.productId} name={r.name} onPick={(p: any) => { const pr = priceForClient(p); setRow(i, { productId: p.id, name: p.name, color: p.color || extractRal(p.name), ...(p.widthCm != null ? { cm: String(p.widthCm) } : {}), ...(pr > 0 ? { price: String(pr) } : {}) }) }} /></td>
                <td style={{ padding: '4px 4px', width: 64 }}><input style={{ ...inp, width: 58, textAlign: 'right' }} type="number" value={r.cm} onChange={e => { const cm = e.target.value; setRow(i, { cm, name: r.name ? itemName({ name: r.name, color: r.color, cm }) : r.name }) }} placeholder="см" /></td>
                <td style={{ padding: '4px 4px', width: 56 }}><input data-qty style={{ ...inp, width: 50, textAlign: 'right' }} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></td>
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
        <span style={{ fontSize: 13, color: '#5f5952' }}>Всего: <b style={{ color: '#26231f' }}>{totalCm}</b> см</span>
        <span style={{ fontSize: 13 }}>Итого: <b>{Math.round(grand).toLocaleString('ru-RU')} ₸</b></span>
        {noPrice.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: '#c0532a' }}>⚠ Без цены: {noPrice.length} поз. — впишите «тг за шт» или цену за см</span>}
        <button onClick={done} disabled={busy || !valid} style={{ marginLeft: 'auto', padding: '9px 20px', borderRadius: 8, border: 'none', background: valid ? '#7a3aaa' : '#e6e2dc', color: '#fff', cursor: valid ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '...' : '✓ Создать карточку'}</button>
      </div>
    </div>
  )
}
