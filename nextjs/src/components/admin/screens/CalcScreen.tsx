'use client'
// «Расчёт» — локальный лист сметы по фирмам/линейкам. Слева позиции (название+кол-во),
// справа блоки-фирмы (Цена редактируется, Сумма=Цена×Кол-во авто), снизу итог по фирме.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLORS } from '@/lib/colors'
import { calcGet, calcSave, calcCreate, calcDelete } from '@/lib/api/calc'
import CatalogFilterBar from '@/components/CatalogFilterBar'
import { FOLDERS, extraFolders, filterProducts, emptySel, type CatalogSel } from '@/lib/catalogNav'

const fmt = (n: number) => !n ? '0' : Number(n).toLocaleString('ru-RU')
const num = (v: any) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0 }
const uid = () => 'x' + Math.random().toString(36).slice(2, 9)

export default function CalcScreen({ orgId }: { orgId: string }) {
  const [id, setId] = useState<string | null>(null)
  const [name, setName] = useState('Расчёт')
  const [brands, setBrands] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(true)
  const [tabs, setTabs] = useState<any[]>([])          // вкладки-листы: отдельный расчёт на клиента
  const [products, setProducts] = useState<any[]>([])  // номенклатура для поиска в строках
  const [sel, setSel] = useState<CatalogSel>(() => emptySel())   // фильтр сверху (папка/подпапка/цвет)
  const [allColors, setAllColors] = useState(false)
  const [sugFor, setSugFor] = useState('')             // в какой строке открыт список подсказок
  const [curRow, setCurRow] = useState(-1)             // активная строка — подсвечена целиком
  // Где рисовать список подсказок: координаты ячейки (список живёт поверх страницы).
  const [sugRect, setSugRect] = useState<{ left: number; top: number; bottom: number } | null>(null)
  const openSug = (id: string, el: HTMLInputElement) => { const r = el.getBoundingClientRect(); setSugRect({ left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom) }); setSugFor(id) }
  const t = useRef<any>(null)

  useEffect(() => {
    fetch(`/api/products?orgId=${orgId}`).then(r => r.ok ? r.json() : []).then((d: any[]) => setProducts(Array.isArray(d) ? d : [])).catch(() => {})
  }, [orgId])

  // Поиск строки работает ВНУТРИ выбранного сверху фильтра: папка/подпапка/цвет сужают
  // область, набранный текст ищет по названию и алиасу.
  const folders = useMemo(() => [...FOLDERS, ...extraFolders(products)], [products])
  const activeFolder = folders.find(f => f.key === sel.folder) || folders[0]
  const suggest = (q: string) => (activeFolder ? filterProducts(products, activeFolder, sel, q, 30) : [])
  // В расчёт для клиента ставим АЛИАС (короткое разговорное имя), а 1С-наименование
  // храним в строке — оно понадобится при продаже/накладной, но клиенту его не показываем.
  // Цена тянется из номенклатуры (розница этой орг): в фирму, помеченную «наша», а если
  // такой нет — во все колонки, где цена ещё пустая (заполненные руками не перетираем).
  function pickProduct(i: number, p: any) {
    setSugFor('')
    const retail = Number(p.priceRetail) || 0
    const own = brands.find((b: any) => b.own)
    const nr = rows.map((r, j) => {
      if (j !== i) return r
      const prices = { ...(r.prices || {}) }
      if (retail > 0) {
        if (own) prices[own.id] = retail
        else for (const b of brands) if (!(Number(prices[b.id]) > 0)) prices[b.id] = retail
      }
      return { ...r, name: (p.alias || '').trim() || p.name, name1c: p.name, productId: p.id, unit: p.unit || 'шт', prices }
    })
    commit(brands, nr)
  }

  // Открыть вкладку (без id — последняя). Несохранённое по таймеру успевает уйти: смена
  // вкладки сбрасывает таймер и сохраняет текущий лист сразу.
  async function open(sheetId?: string | null) {
    clearTimeout(t.current)
    if (!saved && id) { await calcSave(id, name, { brands, rows }); setSaved(true) }
    setLoading(true)
    const d: any = await calcGet(sheetId)
    setId(d?.id || null); setName(d?.name || 'Расчёт')
    setBrands(d?.data?.brands || []); setRows(d?.data?.rows || [])
    setTabs(d?.tabs || []); setSaved(true); setLoading(false)
  }
  useEffect(() => { open() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function addTab() {
    clearTimeout(t.current)
    if (!saved && id) await calcSave(id, name, { brands, rows })
    const r: any = await calcCreate(`Расчёт ${(tabs.length || 0) + 1}`, id)
    const d = r?.data || r
    if (!d?.id) return
    setId(d.id); setName(d.name); setBrands(d.data?.brands || []); setRows(d.data?.rows || [])
    setTabs(d.tabs || []); setSaved(true)
  }
  async function removeTab(sheetId: string) {
    if (!confirm('Удалить этот расчёт?')) return
    const r: any = await calcDelete(sheetId)
    const d = r?.data || r
    if (d?.ok === false) { alert(d.error || 'Не удалось'); return }
    setTabs(d?.tabs || [])
    if (sheetId === id) await open((d?.tabs || [])[0]?.id || null)
  }

  function commit(nb = brands, nr = rows, nm = name) {
    setBrands(nb); setRows(nr); setName(nm); setSaved(false)
    if (nm !== name && id) setTabs(ts => ts.map(x => x.id === id ? { ...x, name: nm } : x))   // имя вкладки — сразу
    clearTimeout(t.current)
    t.current = setTimeout(async () => {
      const r: any = await calcSave(id, nm, { brands: nb, rows: nr })
      if (r?.data?.id && !id) setId(r.data.id)
      setSaved(true)
    }, 700)
  }

  // Позиции
  const setRow = (i: number, patch: any) => commit(brands, rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  const setPrice = (i: number, bid: string, val: any) => commit(brands, rows.map((r, j) => j === i ? { ...r, prices: { ...r.prices, [bid]: num(val) } } : r))
  const addRow = () => commit(brands, [...rows, { id: uid(), name: '', qty: 0, prices: {} }])
  const delRow = (i: number) => commit(brands, rows.filter((_, j) => j !== i))
  // Фирмы
  const setBrand = (bi: number, patch: any) => commit(brands.map((b, j) => j === bi ? { ...b, ...patch } : b))
  const addBrand = () => commit([...brands, { id: uid(), name: 'Фирма', color: '#6b7280' }])
  const delBrand = (bi: number) => { const b = brands[bi]; const nr = rows.map(r => { const p = { ...r.prices }; delete p[b.id]; return { ...r, prices: p } }); commit(brands.filter((_, j) => j !== bi), nr) }

  // ── Работа как в Excel: ходим по ячейкам стрелками/Enter, Delete очищает ячейку ──
  // Колонки строки: 0 — наименование, 1 — кол-во, дальше цены видимых фирм.
  const visBrands = brands.filter((b: any) => !b.hidden)
  // Фирмы нужны не всегда: когда ни одной видимой нет, лист работает как обычная смета —
  // своя колонка «Цена» сразу после «Кол-во» и «Сумма» рядом (цена живёт в prices._).
  const noBrands = visBrands.length === 0
  const SELF = '_'
  const colCount = 2 + (noBrands ? 1 : visBrands.length)
  const cellId = (r: number, c: number) => `calc-${r}-${c}`
  const focusCell = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= rows.length || c >= colCount) return
    const el = document.getElementById(cellId(r, c)) as HTMLInputElement | null
    if (el) { el.focus(); setTimeout(() => el.select(), 0) }
  }
  function cellKey(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number, clear: () => void) {
    const el = e.currentTarget
    const s = el.selectionStart ?? 0, e2 = el.selectionEnd ?? 0, len = el.value.length
    // Ячейка целиком выделена (после перехода стрелкой) — считаем, что курсор на обоих краях,
    // иначе вправо/влево из такой ячейки не уйти, как это делает Excel.
    const allSel = len > 0 && s === 0 && e2 === len
    const atStart = allSel || (s === 0 && e2 === 0)
    const atEnd = allSel || (s >= len && e2 >= len)
    if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); focusCell(r + 1, c) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(r - 1, c) }
    else if (e.key === 'ArrowLeft' && atStart) { e.preventDefault(); focusCell(r, c - 1) }
    else if (e.key === 'ArrowRight' && atEnd) { e.preventDefault(); focusCell(r, c + 1) }
    else if (e.key === 'Delete') { e.preventDefault(); clear() }
  }
  // «Вставить комплект»: всё, что отобрано фильтром сверху (например «Модерн бюджет 8017»),
  // разом ложится в строки — менеджеру остаётся проставить количества. Сначала заполняем
  // пустые строки, не хватает — добавляем новые. Цена тянется так же, как при выборе товара.
  function insertKit() {
    const list = activeFolder ? filterProducts(products, activeFolder, sel, '', 60) : []
    if (!list.length) return
    const own = brands.find((b: any) => b.own)
    const mk = (r: any, p: any) => {
      const prices = { ...(r?.prices || {}) }
      const retail = Number(p.priceRetail) || 0
      if (retail > 0) { if (own) prices[own.id] = retail; else for (const b of brands) if (!(Number(prices[b.id]) > 0)) prices[b.id] = retail }
      return { id: r?.id || uid(), name: (p.alias || '').trim() || p.name, name1c: p.name, productId: p.id, unit: p.unit || 'шт', qty: 0, prices }
    }
    const next = [...rows]
    let k = 0
    for (let i = 0; i < next.length && k < list.length; i++) if (!String(next[i].name || '').trim()) next[i] = mk(next[i], list[k++])
    while (k < list.length) next.push(mk(null, list[k++]))
    commit(brands, next)
  }

  // Очистить колонку наименований: пропадает товар — пропадают и цены, иначе в листе
  // остаются «висячие» суммы без позиции. Количества тоже обнуляем.
  const clearNames = () => { if (!confirm('Очистить все наименования? Цены по позициям тоже уйдут.')) return; commit(brands, rows.map(r => ({ ...r, name: '', name1c: '', productId: null, qty: 0, prices: {} }))) }
  const clearQty = () => { if (!confirm('Очистить все количества?')) return; commit(brands, rows.map(r => ({ ...r, qty: 0 }))) }
  // Очистить всю колонку цен фирмы (кнопка в её шапке).
  const clearBrand = (b: any) => { if (!confirm(`Очистить все цены «${b.name}»?`)) return; commit(brands, rows.map(r => { const p = { ...(r.prices || {}) }; delete p[b.id]; return { ...r, prices: p } })) }

  const sumOf = (r: any, b: any) => (Number(r.prices?.[b.id]) || 0) * (Number(r.qty) || 0)
  const totalOf = (b: any) => rows.reduce((s, r) => s + sumOf(r, b), 0)
  const totals: Record<string, number> = {}; for (const b of brands) totals[b.id] = totalOf(b)
  const positive = brands.map(b => totals[b.id]).filter(v => v > 0)
  const minTotal = positive.length ? Math.min(...positive) : 0

  const th: React.CSSProperties = { padding: '7px 8px', fontSize: 12, fontWeight: 700, border: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { border: `1px solid ${COLORS.border}`, padding: '2px 6px', fontSize: 13.5 }
  const tint = (hex: string, a = '14') => hex + a
  const cellInp: React.CSSProperties = { width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit', fontSize: 13.5, background: 'transparent', outline: 'none', boxSizing: 'border-box' }
  const numInp: React.CSSProperties = { ...cellInp, textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }

  if (loading && !tabs.length) return <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>

  return (
    <div>
      {/* Одна строка вместо трёх: вкладки-листы (имя активной правится прямо во вкладке),
          «+ Новый расчёт», справа — статус сохранения и «+ Фирма». */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
        {tabs.map(tb => {
          const on = tb.id === id
          return on ? (
            <div key={tb.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 9, flexShrink: 0, background: '#fff', boxShadow: `0 0 0 1.5px ${COLORS.primary}` }}>
              <input value={name} onChange={e => commit(brands, rows, e.target.value)} title="Имя расчёта" style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, width: Math.max(90, (name || '').length * 8 + 14) }} />
              {tabs.length > 1 && <span onClick={() => removeTab(tb.id)} title="Удалить расчёт" style={{ color: '#c1121c', fontSize: 13, cursor: 'pointer' }}>✕</span>}
            </div>
          ) : (
            <div key={tb.id} onClick={() => open(tb.id)} style={{ padding: '6px 10px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, background: '#f1efec', color: COLORS.textMuted, fontSize: 13.5 }}>{tb.name || 'Расчёт'}</div>
          )
        })}
        <button onClick={addTab} title="Новый расчёт для клиента" style={{ flexShrink: 0, padding: '6px 11px', borderRadius: 9, border: `1.5px dashed ${COLORS.border}`, background: 'transparent', color: COLORS.textMuted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>+ Новый расчёт</button>
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, color: saved ? '#2e8a5e' : COLORS.textMuted }}>{saved ? '✓ сохранено' : '… сохраняю'}</span>
        <button onClick={addBrand} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 9, border: 'none', background: '#eef2ff', color: '#4f46e5', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>+ Фирма</button>
      </div>

      {/* Фильтр каталога (как в кассе): задаёт область, внутри которой ищет каждая строка. */}
      <CatalogFilterBar products={products} sel={sel} onChange={setSel} allColors={allColors} onAllColors={setAllColors}
        extra={(() => {
          const n = (activeFolder ? filterProducts(products, activeFolder, sel, '', 60) : []).length
          return n ? <button onClick={insertKit} title="Вставить все позиции выбранного набора в строки — останется проставить количества" style={{ border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>📦 вставить комплект · {n}</button> : null
        })()} />

      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: `0 0 0 1.5px ${COLORS.border}` }}>
        {/* Ширины колонок заданы явно: всё лишнее место достаётся «Наименованию»,
            а «Кол-во» и цены остаются узкими (иначе таблица растягивала их на пол-экрана). */}
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: 450 + (noBrands ? 210 : 0) + brands.reduce((s, b) => s + (b.hidden ? 30 : 188), 0) }}>
          <colgroup>
            <col style={{ width: 38 }} />
            <col />
            <col style={{ width: 78 }} />
            {noBrands && <><col style={{ width: 100 }} /><col style={{ width: 110 }} /></>}
            {brands.map(b => b.hidden
              ? <col key={b.id} style={{ width: 30 }} />
              : <Fragment key={b.id}><col style={{ width: 92 }} /><col style={{ width: 96 }} /></Fragment>)}
            <col style={{ width: 34 }} />
          </colgroup>
          <thead>
            {/* Шапка-фирмы */}
            <tr>
              <th style={{ ...th, background: COLORS.bg }} rowSpan={2}>№</th>
              {/* Очистка колонки: имена — вместе с ценами (товара нет — цене неоткуда взяться),
                  количества — отдельно (прайс фирм остаётся). */}
              <th style={{ ...th, background: COLORS.bg, textAlign: 'left' }} rowSpan={2}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Наименование
                  <button onClick={clearNames} title="Очистить все наименования (цены тоже уйдут — товара нет)" style={{ border: `1px solid ${COLORS.border}`, background: '#fff', color: '#8a8377', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 12, lineHeight: 1, padding: '5px 8px', fontFamily: 'inherit' }}>⌫</button>
                </span>
              </th>
              <th style={{ ...th, background: COLORS.bg }} rowSpan={2}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  Кол-во
                  <button onClick={clearQty} title="Очистить все количества" style={{ border: `1px solid ${COLORS.border}`, background: '#fff', color: '#8a8377', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 12, lineHeight: 1, padding: '5px 8px', fontFamily: 'inherit' }}>⌫</button>
                </span>
              </th>
              {/* Без фирм — обычная смета: цена и сумма сразу после количества. */}
              {noBrands && <>
                <th style={{ ...th, background: COLORS.bg, textAlign: 'right' }} rowSpan={2}>Цена</th>
                <th style={{ ...th, background: '#f4f3f0', textAlign: 'right' }} rowSpan={2}>Сумма</th>
              </>}
              {brands.map((b, bi) => (
                b.hidden ? (
                  // Свёрнутая фирма: узкая колонка, по клику разворачивается обратно.
                  <th key={b.id} rowSpan={2} title={`Показать «${b.name}»`} onClick={() => setBrand(bi, { hidden: false })}
                    style={{ ...th, background: b.color, color: '#fff', cursor: 'pointer', width: 34, padding: '6px 4px', writingMode: 'vertical-rl', textAlign: 'center' }}>
                    ▸ {b.name}
                  </th>
                ) : (
                <th key={b.id} colSpan={2} style={{ ...th, background: b.color, color: '#fff', textAlign: 'center', overflow: 'hidden', padding: '4px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', minWidth: 0 }}>
                    <input type="color" value={b.color} onChange={e => setBrand(bi, { color: e.target.value })} title="Цвет" style={{ width: 18, height: 18, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0 }} />
                    <input value={b.name} onChange={e => setBrand(bi, { name: e.target.value })} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: '#fff', fontWeight: 800, fontSize: 13, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                  {/* Кнопки — второй строкой и значками, иначе шапка не влезала в ширину колонки
                      и наезжала на соседние (свёрнутые) фирмы. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 3 }}>
                    {[
                      { t: '⌫', title: 'Очистить все цены этой фирмы', on: () => clearBrand(b), act: false },
                      { t: b.own ? '●' : '○', title: 'Наша фирма: розничная цена из номенклатуры тянется сюда', on: () => commit(brands.map((x, j) => ({ ...x, own: j === bi ? !x.own : false })), rows), act: !!b.own },
                      { t: '⟨', title: 'Скрыть колонку этой фирмы', on: () => setBrand(bi, { hidden: true }), act: false },
                      { t: '✕', title: 'Убрать фирму совсем', on: () => delBrand(bi), act: false },
                    ].map(btn => (
                      <button key={btn.t + btn.title} onClick={btn.on} title={btn.title} style={{ border: 'none', background: btn.act ? '#fff' : 'rgba(255,255,255,.3)', color: btn.act ? b.color : '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 12.5, lineHeight: 1, padding: '5px 9px', fontFamily: 'inherit' }}>{btn.t}</button>
                    ))}
                  </div>
                </th>
                )
              ))}
              <th style={{ ...th, background: COLORS.bg }} rowSpan={2}></th>
            </tr>
            <tr>
              {brands.map(b => b.hidden ? null : (
                <Fragment key={b.id}>
                  <th style={{ ...th, background: tint(b.color, '22'), textAlign: 'right' }}>Цена</th>
                  <th style={{ ...th, background: tint(b.color, '33'), textAlign: 'right' }}>Сумма</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i === curRow ? '#fff6e0' : (i % 2 ? '#fafafa' : '#fff'), boxShadow: i === curRow ? `inset 0 0 0 2px ${COLORS.primary}55` : 'none' }}>
                <td style={{ ...td, textAlign: 'center', color: COLORS.textMuted }}>{i + 1}</td>
                {/* Поиск по названию внутри выбранного сверху фильтра: набираешь — выпадают товары. */}
                <td style={{ ...td, position: 'relative' }}>
                  <input id={cellId(i, 0)} value={r.name} onChange={e => { setRow(i, { name: e.target.value }); openSug(r.id, e.currentTarget) }}
                    onFocus={e => { openSug(r.id, e.currentTarget); setCurRow(i) }} onBlur={() => setTimeout(() => setSugFor(s => s === r.id ? '' : s), 160)}
                    onKeyDown={e => cellKey(e, i, 0, () => setRow(i, { name: '', name1c: '', productId: null }))}
                    placeholder="🔍 поиск по названию" style={cellInp} />
                  {sugFor === r.id && sugRect && (() => {
                    const found = suggest(r.name)
                    if (!found.length) return null
                    // Список рисуем ПОВЕРХ страницы (portal + fixed): внутри таблицы его резал
                    // контейнер с прокруткой, хотя справа места хватает. Ширина — до правого
                    // края окна, вверх разворачивается, если снизу не помещается.
                    const vw = window.innerWidth, vh = window.innerHeight
                    const width = Math.max(460, Math.min(760, vw - sugRect.left - 24))
                    const up = sugRect.bottom + 300 > vh && sugRect.top > 320
                    return createPortal((
                      <div style={{ position: 'fixed', zIndex: 2000, left: sugRect.left, width, ...(up ? { bottom: vh - sugRect.top + 2 } : { top: sugRect.bottom + 2 }), background: '#fff', borderRadius: 10, boxShadow: '0 10px 28px rgba(38,35,31,.22)', border: `1px solid ${COLORS.border}`, maxHeight: 300, overflowY: 'auto' }}>
                        {found.map((p: any) => {
                          const al = (p.alias || '').trim()
                          return (
                            <div key={p.id} onMouseDown={() => pickProduct(i, p)} style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${COLORS.borderLight}`, display: 'flex', gap: 8, alignItems: 'baseline', lineHeight: 1.35 }}>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                {al || p.name}
                                {al && <span style={{ display: 'block', fontSize: 11.5, color: COLORS.textMuted }}>{p.name}</span>}
                              </span>
                              <span style={{ color: COLORS.textMuted, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>{p.unit || 'шт'}</span>
                            </div>
                          )
                        })}
                      </div>
                    ), document.body)
                  })()}
                </td>
                <td style={{ ...td, background: '#f4f3f0' }}><input id={cellId(i, 1)} value={Number(r.qty) ? String(Number(r.qty)) : ''} inputMode="decimal" onFocus={() => setCurRow(i)} onKeyDown={e => cellKey(e, i, 1, () => setRow(i, { qty: 0 }))} onChange={e => setRow(i, { qty: num(e.target.value) })} placeholder="0" style={numInp} /></td>
                {noBrands && <>
                  <td style={td}><input id={cellId(i, 2)} value={Number(r.prices?.[SELF]) ? String(Number(r.prices[SELF])) : ''} inputMode="decimal" onFocus={() => setCurRow(i)} onKeyDown={e => cellKey(e, i, 2, () => setPrice(i, SELF, ''))} onChange={e => setPrice(i, SELF, e.target.value)} placeholder="0" style={numInp} /></td>
                  <td style={{ ...td, background: '#f8f7f4', textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>{(Number(r.prices?.[SELF]) || 0) * (Number(r.qty) || 0) ? fmt((Number(r.prices[SELF]) || 0) * (Number(r.qty) || 0)) : ''}</td>
                </>}
                {brands.map(b => b.hidden
                  ? <td key={b.id} style={{ ...td, background: tint(b.color, '10') }} />
                  : (
                  <Fragment key={b.id}>
                    <td style={{ ...td, background: tint(b.color, '10') }}><input id={cellId(i, 2 + visBrands.findIndex((x: any) => x.id === b.id))} value={Number(r.prices?.[b.id]) ? String(Number(r.prices[b.id])) : ''} inputMode="decimal" onFocus={() => setCurRow(i)} onKeyDown={e => cellKey(e, i, 2 + visBrands.findIndex((x: any) => x.id === b.id), () => setPrice(i, b.id, ''))} onChange={e => setPrice(i, b.id, e.target.value)} placeholder="0" style={numInp} /></td>
                    <td style={{ ...td, background: tint(b.color, '1f'), textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>{sumOf(r, b) ? fmt(sumOf(r, b)) : ''}</td>
                  </Fragment>
                ))}
                <td style={{ ...td, textAlign: 'center' }}><button onClick={() => delRow(i)} title="Убрать строку" style={{ border: 'none', background: 'transparent', color: '#b3261e', cursor: 'pointer', fontWeight: 700 }}>✕</button></td>
              </tr>
            ))}
            {/* Итого */}
            <tr style={{ background: '#fff7d6', fontWeight: 800 }}>
              <td style={td}></td>
              <td style={td} colSpan={2}>{noBrands ? 'ИТОГО' : 'ИТОГО по фирме'}</td>
              {noBrands && <>
                <td style={td}></td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'Consolas, monospace', background: '#f4f3f0' }}>{fmt(rows.reduce((s, r) => s + (Number(r.prices?.[SELF]) || 0) * (Number(r.qty) || 0), 0))}</td>
              </>}
              {brands.map(b => {
                const isMin = totals[b.id] > 0 && totals[b.id] === minTotal
                // Свёрнутая фирма участвует в сравнении, но итог показываем компактно.
                if (b.hidden) return <td key={b.id} title={`${b.name}: ${fmt(totals[b.id])}`} style={{ ...td, background: isMin ? '#d7f5e0' : tint(b.color, '1f'), textAlign: 'center', fontSize: 11, color: '#5f5952' }}>•</td>
                return (
                  <Fragment key={b.id}>
                    <td style={{ ...td, background: tint(b.color, '10') }}></td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'Consolas, monospace', background: isMin ? '#d7f5e0' : tint(b.color, '1f'), color: isMin ? '#0f7b3d' : '#211f1c' }}>{fmt(totals[b.id])}{isMin ? ' ✓' : ''}</td>
                  </Fragment>
                )
              })}
              <td style={td}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button onClick={addRow} style={{ padding: '9px 16px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, background: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>+ Добавить строку</button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: COLORS.textMuted }}>Сумма = Цена × Кол-во. Зелёным ✓ — самый дешёвый итог. Цены/фирмы/позиции редактируются прямо в таблице, сохраняется автоматически.</div>
    </div>
  )
}
