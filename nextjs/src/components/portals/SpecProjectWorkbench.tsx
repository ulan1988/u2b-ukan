'use client'
// Спец-проект мастера (кабинет филиала, мобильный). Мастер набирает 4-10 позиций
// своей моделькой (цвета + Комплектующие), сразу видит раскрой (сколько листов надо),
// и «В очередь →» сохраняет спец-проект. Дальше из очереди выносит части к логисту.
import { useState, useRef, useEffect } from 'react'
import NomInline from '@/components/NomInline'
import ContragentPicker from '@/components/ContragentPicker'
import { extractRal, RalDot, ralOrdered } from '@/lib/ral'
import { overlayFor, NomItem } from '@/lib/nomTree'
import { optimizeCut, SHEET_WIDTH_CM } from '@/lib/production'
import { createSpecProject, produceToStock } from '@/lib/api/refs'
import { itemName } from '@/lib/itemName'

const PRIMARY = '#d4613a'
const SEG = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#e34948', '#008300']
interface Row { productId: string; name: string; color: string; cm: string; qty: string; price: string }
const inp: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const blank = (): Row => ({ productId: '', name: '', color: '', cm: '', qty: '1', price: '' })

export default function SpecProjectWorkbench({ products, contragents = [], onDone, showMsg }: { products: any[]; contragents?: any[]; onDone: () => void; showMsg: (m: string) => void }) {
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [priceCm, setPriceCm] = useState('')
  const [rows, setRows] = useState<Row[]>([blank()])
  const [busy, setBusy] = useState(false)
  const [showCalc, setShowCalc] = useState(false)   // раскрой считается по кнопке
  const [qColor, setQColor] = useState(''); const [allColors, setAllColors] = useState(false)
  const [qKind, setQKind] = useState(''); const [qCm, setQCm] = useState(''); const [qQty, setQQty] = useState('1')
  const nameRef = useRef<HTMLInputElement>(null)
  const cmRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))

  // Моделька: цвета + виды из «Комплектующие» (Изделие/Нар.угол/H-профиль).
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
    if (accKind.measure && !qCm) { cmRef.current?.focus(); return }
    const prod = findProd(accKind, qColor)
    const base = prod?.name || accKind.terms?.[0] || accKind.label
    // Имя строки собираем сразу по формуле «вид + цвет + см» (видно в таблице)
    const nm = itemName({ name: base, color: qColor, cm: accKind.measure ? qCm : '' })
    const qty = Math.max(1, Number(qQty) || 1)
    const row: Row = { productId: prod?.id || '', name: nm, color: qColor === 'decor' ? 'decor' : (qColor || extractRal(nm)), cm: accKind.measure ? qCm : '', qty: String(qty), price: '' }
    setRows(rs => [...rs.filter(r => r.name || r.productId || r.cm), row])
    setQCm(''); setQQty('1')
    // возврат курсора на «Длину» — для быстрого набора следующей позиции
    if (accKind.measure) setTimeout(() => cmRef.current?.focus(), 0)
  }

  const piecePrice = (r: Row) => { const auto = (Number(priceCm) || 0) * (Number(r.cm) || 0); return auto > 0 ? auto : (Number(r.price) || 0) }
  // useful = стандартные см наших изделий (из типов, через products.stdWidthCm) — под них подгоняем остатки.
  const useful = Array.from(new Set(products.map((p: any) => Number(p.stdWidthCm)).filter((n: number) => n > 0))).sort((a, b) => a - b)
  const pack = optimizeCut(rows.map(r => ({ name: r.name || 'Изделие', color: r.color || extractRal(r.name), cm: Number(r.cm) || 0, qty: Number(r.qty) || 0 })), SHEET_WIDTH_CM, 0, { useful })
  const hasPos = rows.some(r => (r.name || r.productId) && Number(r.qty) > 0)
  const valid = !!name.trim() && hasPos

  async function save() {
    if (!name.trim()) { showMsg('Введите название спец-проекта'); return }
    if (!hasPos) { showMsg('Добавьте хотя бы одну позицию'); return }
    setBusy(true)
    try {
      const items = rows.filter(r => (r.name || r.productId) && Number(r.qty) > 0).map(r => {
        const nm = itemName(r)
        return { name: nm, qty: Number(r.qty) || 0, unit: 'шт', productId: r.productId || undefined, widthCm: Number(r.cm) || undefined, price: Math.round(piecePrice(r)) }
      })
      const res: any = await createSpecProject({ name, clientId: clientId || undefined, items })
      if (res?.id || res?.ok) { showMsg('✓ Спец-проект в очереди'); onDone() }
      else showMsg('⚠ ' + (res?.error || 'Не удалось'))
    } catch { showMsg('⚠ Ошибка сети') } finally { setBusy(false) }
  }

  // «В запас»: изделия сразу в свой склад (собственное производство) — списывает листы раскроем.
  async function toStock() {
    if (!hasPos) { showMsg('Добавьте хотя бы одну позицию'); return }
    setBusy(true)
    try {
      const items = rows.filter(r => (r.name || r.productId) && Number(r.qty) > 0).map(r => {
        const nm = itemName(r)
        return { productId: r.productId || undefined, name: nm, widthCm: Number(r.cm) || undefined, qty: Number(r.qty) || 0 }
      })
      const res: any = await produceToStock(items)
      if (res.ok) { showMsg(`📦 В запас: ${res.data?.produced ?? items.length} поз · −${res.data?.consumed?.sheets ?? 0} лист`); onDone() }
      else showMsg('⚠ ' + (res.error || 'Не удалось'))
    } catch { showMsg('⚠ Ошибка сети') } finally { setBusy(false) }
  }

  const th: React.CSSProperties = { padding: '6px 6px', fontSize: 11, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }
  const qpill = (on: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: on ? PRIMARY : '#f1efec', color: on ? '#fff' : '#4a4640' })

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>НАЗВАНИЕ ПРОЕКТА</label>
          <input ref={nameRef} style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="напр. Отливы RAL8017 — партия" />
        </div>
        <div style={{ width: 120 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>ЦЕНА ЗА СМ</label>
          <input style={inp} type="number" value={priceCm} onChange={e => setPriceCm(e.target.value)} placeholder="тг/см" />
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>👤 АВТОР / ЗАКАЗЧИК</label>
          <ContragentPicker contragents={contragents} value={clientId} onPick={(c: any) => { setClientId(c.id); if (!name.trim()) setTimeout(() => nameRef.current?.focus(), 0) }} placeholder="— выберите заказчика —" />
        </div>
      </div>

      {/* Моделька: цвета + Комплектующие */}
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
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); qtyRef.current?.focus(); qtyRef.current?.select() } }}
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

      {/* Раскрой — по кнопке */}
      <button type="button" onClick={() => setShowCalc(v => !v)} disabled={!hasPos} style={{ marginBottom: 10, padding: '9px 16px', borderRadius: 8, border: 'none', background: !hasPos ? '#e6e2dc' : showCalc ? '#334155' : '#6366f1', color: '#fff', cursor: hasPos ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{showCalc ? '× Скрыть раскрой' : '📐 Рассчитать раскрой'}</button>
      {showCalc && pack.totalSheets > 0 && (
        <div style={{ background: '#eef7f1', border: '1.5px solid #cfeadd', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 15 }}>📐 Листов: <b style={{ color: '#2e8a5e', fontSize: 18 }}>{pack.totalSheets}</b> <span style={{ color: '#837c72', fontSize: 12 }}>(по {pack.sheetWidth} см)</span></span>
            {pack.smart
              ? <>
                  <span>в дело <b style={{ color: '#2e8a5e' }}>{pack.totalGood}</b> см</span>
                  <span>мусор <b style={{ color: pack.totalScrap ? '#e34948' : '#2e8a5e' }}>{pack.totalScrap}</b> см</span>
                  <span>рез <b style={{ color: pack.scrapPct <= 3 ? '#2e8a5e' : '#b07a00' }}>{pack.scrapPct}%</b></span>
                </>
              : <><span>обрезь <b>{pack.totalWaste}</b> см</span><span>КПД <b style={{ color: pack.totalEff >= 90 ? '#2e8a5e' : '#b07a00' }}>{pack.totalEff}%</b></span></>}
            {pack.oversize > 0 && <span style={{ color: '#b03020', fontWeight: 700 }}>⚠ {pack.oversize} шт шире листа</span>}
          </div>
          {pack.byColor.map(g => (
            <div key={g.color} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #d7ecdf' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                <RalDot code={g.color} /><b>{g.color}</b>
                <span style={{ color: '#5f5952' }}>{g.count} лист · обрезь {g.waste} см · КПД {g.eff}%</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {g.sheets.map((sh, si) => (
                  <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#9a938a', width: 42, flexShrink: 0 }}>Лист {si + 1}</span>
                    <div style={{ flex: 1, height: 20, borderRadius: 4, background: '#eee', border: '1px solid #e0e0e0', overflow: 'hidden', display: 'flex' }}>
                      {sh.segs.map((seg, gi) => (
                        <div key={gi} title={`${seg.name} — ${seg.cm} см`} style={{ width: `${seg.cm / pack.sheetWidth * 100}%`, background: SEG[seg.ci % SEG.length], borderLeft: gi > 0 ? '1px solid rgba(255,255,255,.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap' }}>{seg.cm / pack.sheetWidth > 0.06 ? seg.cm : ''}</div>
                      ))}
                      {sh.waste > 0 && (pack.smart && (sh.good || 0) > 0 ? (<>
                        {(sh.waste - (sh.scrap || 0)) > 0.001 && <div title={`в дело ${sh.good} см`} style={{ width: `${(sh.waste - (sh.scrap || 0)) / pack.sheetWidth * 100}%`, background: '#dcf5e6', color: '#2e8a5e', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', fontWeight: 700 }}>{(sh.waste - (sh.scrap || 0)) / pack.sheetWidth > 0.05 ? '↺' : ''}</div>}
                        {(sh.scrap || 0) > 0 && <div title={`мусор ${sh.scrap} см`} style={{ width: `${(sh.scrap || 0) / pack.sheetWidth * 100}%`, background: '#fff0f0', color: '#e34948', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>{(sh.scrap || 0) / pack.sheetWidth > 0.05 ? sh.scrap : ''}</div>}
                      </>) : <div title={`обрезь ${sh.waste} см`} style={{ width: `${sh.waste / pack.sheetWidth * 100}%`, background: '#fff0f0', color: '#e34948', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>{sh.waste / pack.sheetWidth > 0.05 ? sh.waste : ''}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Позиции */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead><tr style={{ background: '#f8f6f3' }}>
            <th style={th}>№</th><th style={{ ...th, minWidth: 150 }}>НОМЕНКЛАТУРА (цвет)</th><th style={{ ...th, textAlign: 'right' }}>СМ</th><th style={{ ...th, textAlign: 'right' }}>ШТ</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1efec' }}>
                <td style={{ padding: '4px 6px', fontSize: 12, color: '#837c72' }}>{i + 1}</td>
                <td style={{ padding: '4px 4px', minWidth: 150 }}><NomInline products={products} value={r.productId} name={r.name} onPick={(p: any) => setRow(i, { productId: p.id, name: p.name, color: p.color || extractRal(p.name), ...(p.widthCm != null ? { cm: String(p.widthCm) } : {}) })} /></td>
                <td style={{ padding: '4px 4px', width: 64 }}><input style={{ ...inp, width: 58, textAlign: 'right' }} type="number" value={r.cm} onChange={e => { const cm = e.target.value; setRow(i, { cm, name: r.name ? itemName({ name: r.name, color: r.color, cm }) : r.name }) }} placeholder="см" /></td>
                <td style={{ padding: '4px 4px', width: 56 }}><input style={{ ...inp, width: 50, textAlign: 'right' }} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></td>
                <td style={{ padding: '4px 4px', width: 46, whiteSpace: 'nowrap' }}>
                  <button onClick={() => setRows(rs => [...rs.slice(0, i + 1), { ...r }, ...rs.slice(i + 1)])} title="Клон" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>📋</button>
                  <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} title="Удалить" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#c1121c' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button onClick={() => setRows(rs => [...rs, blank()])} style={{ border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '5px 14px', background: 'none', cursor: 'pointer', fontSize: 13, color: '#5f5952', fontFamily: 'inherit' }}>＋ Пустая строка</button>
        <button onClick={toStock} disabled={busy || !hasPos} style={{ marginLeft: 'auto', padding: '9px 16px', borderRadius: 8, border: '1.5px solid #cfeadd', background: hasPos ? '#eef7f1' : '#f1efec', color: hasPos ? '#2e8a5e' : '#9a938a', cursor: hasPos ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', opacity: busy ? .6 : 1 }} title="Изделия сразу в свой склад (собственное производство)">📦 В запас</button>
        <button onClick={save} disabled={busy || !valid} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: valid ? PRIMARY : '#e6e2dc', color: '#fff', cursor: valid ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '...' : 'В очередь →'}</button>
      </div>
    </div>
  )
}
