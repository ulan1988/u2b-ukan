'use client'
// «Расчёт» — локальный лист сметы по фирмам/линейкам. Слева позиции (название+кол-во),
// справа блоки-фирмы (Цена редактируется, Сумма=Цена×Кол-во авто), снизу итог по фирме.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLORS } from '@/lib/colors'
import { useAdmin } from '@/components/admin/AdminChrome'
import { calcGet, calcSave, calcCreate, calcDelete } from '@/lib/api/calc'
import { sellCheck, otherIncome } from '@/lib/api/orders'
import { fetchRefs } from '@/lib/api/refs'
import ContragentPicker from '@/components/ContragentPicker'
import CatalogFilterBar from '@/components/CatalogFilterBar'
import { FOLDERS, extraFolders, filterProducts, emptySel, norm, isBonusProduct, type CatalogSel } from '@/lib/catalogNav'

const fmt = (n: number) => !n ? '0' : Number(n).toLocaleString('ru-RU')
const num = (v: any) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0 }
const uid = () => 'x' + Math.random().toString(36).slice(2, 9)

export default function CalcScreen({ orgId }: { orgId: string }) {
  const orgName = (useAdmin() as any)?.orgName || ''   // шапки на этом экране нет — пишем орг рядом с вкладками
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
  // Продажа из расчёта — панель «Чек» справа (рабочее место кассира за компьютером):
  // покупатель, код чека, скидка, СМЕШАННАЯ оплата по счетам и сдача.
  const [sellContact, setSellContact] = useState('')
  const [sellCode, setSellCode] = useState('')
  const [pay, setPay] = useState({ cash: '', kaspi: '', qr: '', debt: '' })   // суммы по способам — можно смешивать
  const [disc, setDisc] = useState<{ mode: 'sum' | 'pct'; val: string }>({ mode: 'sum', val: '' })
  const [given, setGiven] = useState('')
  const [incNote, setIncNote] = useState('')          // за что «прочий доход» (пишем в комментарий платежа)                 // сколько дали налом → сдача
  const [wide, setWide] = useState(true)                 // широкий экран: чек рядом с таблицей
  const [full, setFull] = useState(false)                // полноэкранный режим кассы (без меню слева)
  const [selling, setSelling] = useState(false)
  const [sellMsg, setSellMsg] = useState('')
  const [cags, setCags] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])          // сотрудники филиала — кто пробил чек
  const [sellerId, setSellerId] = useState('')           // продавец по умолчанию (как в кассе, на устройстве)
  const [dragRow, setDragRow] = useState<string | null>(null)   // строка, которую тащим мышкой
  const [pullMsg, setPullMsg] = useState('')       // результат «подтянуть цены» — видно, что произошло
  const [curRow, setCurRow] = useState(-1)             // активная строка — подсвечена целиком
  const [bonusPick, setBonusPick] = useState<string | null>(null)  // строка, для которой выбираем соседа
  const [bcol, setBcol] = useState(true)   // колонка «🤝 Бонус» (штуки соседа) — прячется глазком
  // Где рисовать список подсказок: координаты ячейки (список живёт поверх страницы).
  const [sugRect, setSugRect] = useState<{ left: number; top: number; bottom: number } | null>(null)
  const openSug = (id: string, el: HTMLInputElement) => { const r = el.getBoundingClientRect(); setSugRect({ left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom) }); setSugFor(id) }
  const t = useRef<any>(null)
  const priceSaveT = useRef<any>(null)   // отложенная запись новой цены в номенклатуру

  // Сотрудники орг + запомненный продавец: ключ тот же, что у кассы магазина,
  // поэтому выбранный там Нурбол подставится и в продаже из «Расчёта».
  useEffect(() => {
    if (!orgId) return
    fetch(`/api/employees?orgId=${orgId}`).then(r => r.ok ? r.json() : []).then((d: any[]) => {
      const list = Array.isArray(d) ? d : []
      setStaff(list)
      try { const raw = localStorage.getItem(`u2b_seller_${orgId}`); const saved = raw ? JSON.parse(raw) : null
        setSellerId(prev => prev || (saved?.id && list.some(e => e.id === saved.id) ? saved.id : (list[0]?.id || ''))) } catch { setSellerId(prev => prev || (list[0]?.id || '')) }
    }).catch(() => {})
  }, [orgId])
  useEffect(() => { fetchRefs(orgId).then((r: any) => setCags((r.contragents || []).filter((c: any) => !c.archived && c.kind !== 'supplier'))).catch(() => {}) }, [orgId])
  // Полный экран кассы: прячем меню админки (экран рисуем поверх страницы) и просим
  // у браузера настоящий fullscreen. Esc браузера тоже выводит — слушаем fullscreenchange.
  // requestFullscreen возвращает промис и браузер может его отклонить (нет «жеста» пользователя) —
  // гасим отказ, иначе в консоли висит ошибка, а экран и так работает поверх страницы.
  const enterFull = () => { setFull(true); try { (document.documentElement as any).requestFullscreen?.()?.catch?.(() => {}) } catch {} }
  const exitFull = () => { setFull(false); try { if (document.fullscreenElement) document.exitFullscreen()?.catch?.(() => {}) } catch {} }
  useEffect(() => {
    const h = () => { if (!document.fullscreenElement) setFull(false) }
    document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // Узкий экран (ноутбук/планшет) — чек уезжает под таблицу, широкий — стоит справа.
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1180)
    on(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on)
  }, [])
  useEffect(() => {
    // ВАЖНО: без orgId сервер отдаёт шаблон без цен продажи — цены в расчёте будут нулевые.
    if (!orgId) return
    fetch(`/api/products?orgId=${orgId}`).then(r => r.ok ? r.json() : []).then((d: any[]) => setProducts(Array.isArray(d) ? d : [])).catch(() => {})
  }, [orgId])

  // Поиск строки работает ВНУТРИ выбранного сверху фильтра: папка/подпапка/цвет сужают
  // область, набранный текст ищет по названию и алиасу.
  const folders = useMemo(() => [...FOLDERS, ...extraFolders(products)], [products])
  const activeFolder = folders.find(f => f.key === sel.folder) || folders[0]
  const suggest = (q: string) => (activeFolder ? filterProducts(products, activeFolder, sel, q, 30) : [])
  // Бонусная продажа (папка «Долг товаров» / «Сосед товар»): товар взят у соседа и идёт
  // мимо склада — в строке указываем цену соседа и у кого взяли, прибыль делим 50/50
  // с Адал Строй 2, а количество уходит в журнал «Долг товаров».
  const prodOf = (r: any) => products.find((p: any) => p.id === r.productId)
    || products.find((p: any) => norm(p.name) === norm(r.name1c || r.name || ''))
  const isBonusRow = (r: any) => isBonusProduct(prodOf(r))
  // Бонус теперь у ЛЮБОГО товара: колонка «🤝 Бонус» рядом с кол-вом — сколько штук взяли
  // у соседа. Своих 10 + бонусных 5 = 15 шт в чеке: 10 со склада (маржа 60/40), 5 мимо
  // склада (бонус 50/50 с головным, соседу долг товаром). Товар из папки «Долг товаров» —
  // весь от соседа: там бонусное кол-во = всё кол-во строки.
  const ownQty = (r: any) => isBonusRow(r) ? 0 : (Number(r.qty) || 0)
  const bonQty = (r: any) => isBonusRow(r) ? (Number(r.qty) || 0) : (Number(r.bqty) || 0)
  const totQty = (r: any) => ownQty(r) + bonQty(r)
  // В расчёт для клиента ставим АЛИАС (короткое разговорное имя), а 1С-наименование
  // храним в строке — оно понадобится при продаже/накладной, но клиенту его не показываем.
  // Куда класть розничную цену из номенклатуры:
  //  • в фирму, помеченную «● наша»;
  //  • фирм нет вовсе — в свою колонку «Цена» (prices._), иначе цена пропадала;
  //  • иначе — во все фирмы, где цена ещё пустая (вписанные руками не перетираем).
  function applyRetail(prices: Record<string, number>, retail: number) {
    if (!(retail > 0)) return prices
    const own = brands.find((b: any) => b.own)
    if (own) { prices[own.id] = retail; return prices }
    const vis = brands.filter((b: any) => !b.hidden)
    if (!vis.length) { if (!(Number(prices['_']) > 0)) prices['_'] = retail; return prices }
    for (const b of brands) if (!(Number(prices[b.id]) > 0)) prices[b.id] = retail
    return prices
  }

  function pickProduct(i: number, p: any) {
    setSugFor('')
    const retail = Number(p.priceRetail) || 0
    const nr = rows.map((r, j) => {
      if (j !== i) return r
      const prices = applyRetail({ ...(r.prices || {}) }, retail)
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
    const bs: any[] = d?.data?.brands || []
    let rs: any[] = d?.data?.rows || []
    // Лист вели без фирм (цена в своей колонке), потом добавили фирму — цены оказались бы
    // спрятаны. Переносим их в первую фирму один раз при открытии.
    // Цена не должна «исчезать» ни при одном переходе колонок (добавили/убрали/скрыли фирму).
    // Ищем осиротевшие цены — те, что лежат под ключом, которого нет среди колонок листа, —
    // и переносим их в первую подходящую: «нашу» фирму, иначе первую видимую, иначе свою колонку.
    const vis = bs.filter((b: any) => !b.hidden)
    const target = bs.find((b: any) => b.own) || vis[0] || bs[0] || null
    const known = new Set<string>([...bs.map((b: any) => b.id), ...(target ? [] : ['_'])])
    const orphan = (p: any) => Object.entries(p || {}).find(([k, v]) => !known.has(k) && Number(v) > 0)
    if (rs.some(r => orphan(r.prices))) {
      rs = rs.map(r => {
        const o = orphan(r.prices); if (!o) return r
        const prices = { ...(r.prices || {}) }
        const key = target ? target.id : '_'
        if (!(Number(prices[key]) > 0)) prices[key] = Number(o[1])
        delete prices[o[0]]
        return { ...r, prices }
      })
      calcSave(d.id, d.name, { brands: bs, rows: rs }).catch(() => {})
    }
    setId(d?.id || null); setName(d?.name || 'Расчёт')
    setBrands(bs); setRows(rs)
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
    // В подтверждении пишем ИМЯ листа: ✕ стоит вплотную к вкладке, и «удалить этот расчёт?»
    // не показывало, какой именно лист уйдёт.
    const nm = (tabs.find((t: any) => t.id === sheetId)?.name) || name
    if (!confirm(`Удалить расчёт «${nm}»? Восстановить его будет нельзя.`)) return
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
  const setPrice = (i: number, bid: string, val: any) => {
    const v = num(val)
    commit(brands, rows.map((r, j) => j === i ? { ...r, prices: { ...r.prices, [bid]: v } } : r))
    // «Указал один раз — и всё»: если у товара в номенклатуре цены ещё НЕТ, запоминаем
    // введённую. Уже проставленный прайс правка в расчёте не трогает (для него — кнопка
    // «💾 цены в номенклатуру»), чтобы разовая скидка клиенту не поехала в магазин.
    const r = rows[i]; const nm = String(r?.name1c || r?.name || '').trim()
    if (!(v > 0) || !nm) return
    const p: any = products.find((x: any) => (r.productId && x.id === r.productId) || norm(x.name) === norm(nm))
    if (!p || Number(p.priceRetail) > 0) return
    clearTimeout(priceSaveT.current)
    priceSaveT.current = setTimeout(async () => {
      try {
        await fetch('/api/pricing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: p.name, price: v, priceType: 'retail', orgId }) })
        setProducts(ps => ps.map((x: any) => x.id === p.id ? { ...x, priceRetail: String(v) } : x))
        setPullMsg(`цена «${p.alias || p.name}» записана в номенклатуру`)
      } catch { /* нет сети — останется только в листе */ }
    }, 1200)
  }
  const addRow = () => commit(brands, [...rows, { id: uid(), name: '', qty: 0, prices: {} }])
  const delRow = (i: number) => commit(brands, rows.filter((_, j) => j !== i))
  // Фирмы
  const setBrand = (bi: number, patch: any) => commit(brands.map((b, j) => j === bi ? { ...b, ...patch } : b))
  // Первая фирма забирает цены из своей колонки — иначе они пропадут из вида.
  const addBrand = () => {
    const nb = { id: uid(), name: 'Фирма', color: '#6b7280' }
    const first = brands.length === 0
    const nr = first
      ? rows.map(r => { const own = Number(r?.prices?.['_']) || 0; if (!(own > 0)) return r; const prices = { ...(r.prices || {}) }; prices[nb.id] = own; delete prices['_']; return { ...r, prices } })
      : rows
    commit([...brands, nb], nr)
  }
  // Удаляем фирму: её цены уходят вместе с ней, НО если это была последняя фирма —
  // цены переезжают в свою колонку, иначе лист остался бы без цен совсем.
  const delBrand = (bi: number) => {
    const b = brands[bi]
    const last = brands.length === 1
    const nr = rows.map(r => {
      const p = { ...(r.prices || {}) }
      const was = Number(p[b.id]) || 0
      delete p[b.id]
      if (last && was > 0) p['_'] = was
      return { ...r, prices: p }
    })
    commit(brands.filter((_, j) => j !== bi), nr)
  }

  // ── Работа как в Excel: ходим по ячейкам стрелками/Enter, Delete очищает ячейку ──
  // Колонки строки: 0 — наименование, 1 — кол-во, дальше цены видимых фирм.
  const visBrands = brands.filter((b: any) => !b.hidden)
  // Фирмы нужны не всегда: когда ни одной видимой нет, лист работает как обычная смета —
  // своя колонка «Цена» сразу после «Кол-во» и «Сумма» рядом (цена живёт в prices._).
  const noBrands = visBrands.length === 0
  const SELF = '_'
  const priceC0 = bcol ? 3 : 2            // с какой колонки начинаются цены (0 имя, 1 кол-во, 2 бонус)
  const colCount = priceC0 + (noBrands ? 1 : visBrands.length)
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
  // Подтянуть цены к уже набранным строкам (например после вставки комплекта или когда
  // цену в номенклатуре поправили): берём розницу по привязанному товару, иначе по имени.
  function pullPrices() {
    if (!products.length) { setPullMsg('номенклатура ещё грузится — повторите'); return }
    const byId = new Map(products.map((p: any) => [p.id, p]))
    let hit = 0, noPrice = 0, notFound = 0
    const nr = rows.map(r => {
      const named = String(r.name || r.name1c || '').trim()
      if (!named) return r
      // Ищем и по привязке, и по имени/алиасу: привязка могла остаться от другого листа
      // или товар вписан руками.
      const p: any = (r.productId && byId.get(r.productId))
        || products.find((x: any) => norm(x.name) === norm(r.name1c || r.name) || (x.alias && norm(x.alias) === norm(r.name)))
      if (!p) { notFound++; return r }
      const retail = Number(p.priceRetail) || 0
      if (retail > 0) hit++; else noPrice++
      return { ...r, productId: p.id, name1c: p.name, prices: applyRetail({ ...(r.prices || {}) }, retail) }
    })
    commit(brands, nr)
    setPullMsg([hit ? `подтянуто ${hit}` : '', noPrice ? `нет цены в номенклатуре: ${noPrice}` : '', notFound ? `не нашёл товар: ${notFound}` : ''].filter(Boolean).join(' · ') || 'нечего подтягивать')
  }

  // Вписал цену один раз — она уходит в номенклатуру (розница этой орг), и дальше
  // подтягивается сама во всех расчётах и в кассе. Пишем только то, что есть в строке.
  async function savePrices() {
    const key = priceKeyOf()
    const list = rows.filter(r => String(r.name1c || r.name || '').trim() && Number(r.prices?.[key]) > 0)
    if (!list.length) { setPullMsg('нет цен для сохранения'); return }
    setPullMsg('сохраняю…')
    let ok = 0
    for (const r of list) {
      try {
        const res = await fetch('/api/pricing', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: r.name1c || r.name, price: Number(r.prices[key]), priceType: 'retail', orgId }) })
        if (res.ok) ok++
      } catch { /* сеть — посчитаем в остатке */ }
    }
    setPullMsg(`в номенклатуру записано: ${ok}${ok < list.length ? ` (не удалось ${list.length - ok})` : ''}`)
    fetch(`/api/products?orgId=${orgId}`).then(r => r.ok ? r.json() : []).then((d: any[]) => setProducts(Array.isArray(d) ? d : [])).catch(() => {})
  }

  function insertKit() {
    const list = activeFolder ? filterProducts(products, activeFolder, sel, '', 60) : []
    if (!list.length) return
    const mk = (r: any, p: any) => {
      const prices = applyRetail({ ...(r?.prices || {}) }, Number(p.priceRetail) || 0)
      return { id: r?.id || uid(), name: (p.alias || '').trim() || p.name, name1c: p.name, productId: p.id, unit: p.unit || 'шт', qty: 0, prices }
    }
    const next = [...rows]
    let k = 0
    for (let i = 0; i < next.length && k < list.length; i++) if (!String(next[i].name || '').trim()) next[i] = mk(next[i], list[k++])
    while (k < list.length) next.push(mk(null, list[k++]))
    commit(brands, next)
  }

  // ── ПРОДАЖА ИЗ РАСЧЁТА: тот же механизм, что касса магазина (sellCheck → cashier.sellDirect) ──
  // Берём строки, где есть количество и цена; цена — из «нашей» фирмы, иначе из своей колонки,
  // иначе из первой видимой фирмы (то, что менеджер реально показал клиенту).
  const priceKeyOf = () => {
    const own = brands.find((b: any) => b.own)
    if (own) return own.id
    if (noBrands) return SELF
    return visBrands[0]?.id || SELF
  }
  const sellRows = rows.filter(r => String(r.name || '').trim() && totQty(r) > 0 && Number(r.prices?.[priceKeyOf()]) > 0)
  const sellTotal = sellRows.reduce((s, r) => s + totQty(r) * Number(r.prices[priceKeyOf()]), 0)
  // Бонусные строки чека: без цены соседа и без «у кого взяли» продавать нельзя —
  // иначе некому вернуть товар и нечего делить с головным.
  const bonusRowsCart = sellRows.filter(r => bonQty(r) > 0)
  const bonusSum = bonusRowsCart.reduce((s, r) => s + Math.max(0, (Number(r.prices?.[priceKeyOf()]) || 0) - (Number(r.bonusCost) || 0)) * bonQty(r), 0)
  const bonusHq = Math.round(bonusSum * 0.5)
  const bonusToAgent = bonusRowsCart.reduce((s, r) => s + (Number(r.bonusCost) || 0) * bonQty(r), 0)
  // Пока не вписана цена соседа и не выбран он сам — бонус считать не из чего, чек не пробиваем.
  const bonusBad = bonusRowsCart.find(r => !(Number(r.bonusCost) > 0) || !r.bonusAgentId)
  // Скидка по чеку (₸ или %) и смешанная оплата: суммы по счетам должны сойтись с итогом.
  const discPctN = disc.mode === 'pct' ? num(disc.val) : 0
  const discSum = Math.min(sellTotal, Math.max(0, disc.mode === 'pct' ? Math.round(sellTotal * discPctN / 100) : num(disc.val)))
  const net = Math.max(0, sellTotal - discSum)
  const pCash = num(pay.cash), pKaspi = num(pay.kaspi), pQr = num(pay.qr), pDebt = num(pay.debt)
  const allocated = pCash + pKaspi + pQr + pDebt
  const rest = Math.round((net - allocated) * 100) / 100        // сколько ещё не распределено (минус = перебор)
  const givenN = num(given)
  const change = Math.max(0, Math.round((givenN - pCash) * 100) / 100)   // дали налом больше, чем строка «Нал»
  const qtyTotal = sellRows.reduce((s, r) => s + totQty(r), 0)
  const bonQtyTotal = sellRows.reduce((s, r) => s + bonQty(r), 0)
  // Кнопка «всё/остаток» в строке оплаты: добить этот способ до итога.
  const fillPay = (k: 'cash' | 'kaspi' | 'qr' | 'debt') => setPay(p => ({ ...p, [k]: String(Math.max(0, num((p as any)[k]) + rest)) }))
  const canSell = sellRows.length > 0 && net > 0 && Math.abs(rest) < 0.5 && !selling && !bonusBad

  // «Прочий доход»: деньги без товара. Берём суммы из строк оплаты (нал/каспи/QR),
  // кладём на счета и делим 50/50 с головным — склад и накладные не трогаются.
  async function doOtherIncome() {
    const money = pCash + pKaspi + pQr
    if (!(money > 0)) { setSellMsg('⚠ впишите сумму в «Нал», «Каспи» или «QR»'); return }
    if (!confirm(`Провести как ПРОЧИЙ ДОХОД ${fmt(money)} ₸?

Товар не списывается, прибыль делится 50/50 с Адал Строй 2 (ваша доля ${fmt(money - Math.round(money * 0.5))} ₸).`)) return
    setSelling(true); setSellMsg('')
    const emp = staff.find((s2: any) => s2.id === sellerId)
    const r: any = await otherIncome({ contactId: sellContact || undefined, cash: pCash, kaspi: pKaspi, qr: pQr, comment: incNote, seller: emp?.name })
    setSelling(false)
    if (!r.ok) { setSellMsg('⚠ ' + (r.error || 'не удалось')); return }
    setSellMsg(`✓ прочий доход ${fmt(r.sum || money)} ₸ · вам ${fmt(r.ourShare || 0)} · Адал Строй 2 ${fmt(r.hqShare || 0)}`)
    setPay({ cash: '', kaspi: '', qr: '', debt: '' }); setGiven(''); setIncNote('')
  }

  async function doSell() {
    if (!sellRows.length) { setSellMsg('нет строк с количеством и ценой'); return }
    if (!(net > 0)) { setSellMsg('итог чека 0'); return }
    if (Math.abs(rest) >= 0.5) { setSellMsg(rest > 0 ? `⚠ не распределено ${fmt(rest)} ₸` : `⚠ перебор на ${fmt(-rest)} ₸`); return }
    if (pDebt > 0 && !sellContact) { setSellMsg('⚠ долг — только на выбранного покупателя'); return }
    if (bonusBad) { setSellMsg(`⚠ ${bonusBad.name}: укажите цену соседа и у кого взяли`); return }
    setSelling(true); setSellMsg('')
    const key = priceKeyOf()
    const emp = staff.find((s: any) => s.id === sellerId)
    // Долг отдельным полем не шлём: в кассе он считается как итог − нал − каспи − QR.
    // Сдача уменьшает реально внесённый нал (см. cashier.payCard), поэтому шлём «дали налом».
    const r: any = await sellCheck({
      contactId: sellContact || undefined, clientCode: sellCode,
      sellerId: emp?.id, seller: emp?.name,
      cash: pCash + change, kaspi: pKaspi, qr: pQr, change, changeFrom: '',
      discountSum: discSum, discountPct: discPctN,
      comment: `Расчёт «${name}»`,
      // Строка листа = до ДВУХ позиций чека: свои штуки (со склада, маржа 60/40) и
      // бонусные (мимо склада, бонус 50/50 с головным + долг товаром соседу).
      // Цена у обеих одна — та, что показали клиенту.
      positions: sellRows.flatMap(r2 => {
        const base = { productId: r2.productId || undefined, name1c: r2.name1c || r2.name, oral: r2.name, unit: r2.unit || 'шт', price: Number(r2.prices[key]) }
        const out: any[] = []
        if (ownQty(r2) > 0) out.push({ ...base, qty: ownQty(r2) })
        if (bonQty(r2) > 0) out.push({ ...base, qty: bonQty(r2), bonusCost: Number(r2.bonusCost) || undefined, bonusAgentId: r2.bonusAgentId || undefined })
        return out
      }),
    })
    setSelling(false)
    setSellMsg(r.ok ? `✓ чек пробит${r.number ? ` № ${r.number}` : ''} · ${fmt(net)} ₸${r.debt ? ` · долг ${fmt(r.debt)}` : ''}` : '⚠ ' + (r.error || 'не удалось'))
    // Чек пробит — обнуляем количества и оплату: позиции и цены остаются прайсом на следующего
    // клиента, а второй раз случайно пробить тот же чек уже нельзя (количеств нет).
    if (r.ok) {
      setSellContact(''); setSellCode(''); setPay({ cash: '', kaspi: '', qr: '', debt: '' })
      setDisc({ mode: 'sum', val: '' }); setGiven('')
      commit(brands, rows.map(r2 => ({ ...r2, qty: 0, bqty: 0 })))
    }
  }

  // F9 — пробить чек с любого места экрана (как на кассе).
  const sellRef = useRef<() => void>(() => {})
  sellRef.current = doSell
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F9') { e.preventDefault(); sellRef.current() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  // Порядок строк мышкой — как в Номенклатуре: тянем за номер строки и бросаем на другую.
  function moveRow(fromId: string, toId: string) {
    if (!fromId || fromId === toId) return
    const from = rows.find(r => r.id === fromId); if (!from) return
    const arr = rows.filter(r => r.id !== fromId)
    const idx = arr.findIndex(r => r.id === toId)
    arr.splice(idx < 0 ? arr.length : idx, 0, from)   // вставляем ПЕРЕД целевой строкой
    commit(brands, arr)
  }

  // Очистить колонку наименований: пропадает товар — пропадают и цены, иначе в листе
  // остаются «висячие» суммы без позиции. Количества тоже обнуляем.
  const clearNames = () => { if (!confirm('Очистить все наименования? Цены по позициям тоже уйдут.')) return; commit(brands, rows.map(r => ({ ...r, name: '', name1c: '', productId: null, qty: 0, prices: {} }))) }
  const clearQty = () => { if (!confirm('Очистить все количества?')) return; commit(brands, rows.map(r => ({ ...r, qty: 0 }))) }
  // Очистить всю колонку цен фирмы (кнопка в её шапке).
  const clearBrand = (b: any) => { if (!confirm(`Очистить все цены «${b.name}»?`)) return; commit(brands, rows.map(r => { const p = { ...(r.prices || {}) }; delete p[b.id]; return { ...r, prices: p } })) }

  const sumOf = (r: any, b: any) => (Number(r.prices?.[b.id]) || 0) * totQty(r)
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

  const body = (
    <div style={full ? { padding: 12 } : undefined}>
      {/* Одна строка вместо трёх: вкладки-листы (имя активной правится прямо во вкладке),
          «+ Новый расчёт», справа — статус сохранения и «+ Фирма». */}
      {/* Одна узкая строка: орг · вкладки · новый расчёт · статус · фирма. Шапки страницы
          на этом экране нет — всё место отдано таблице. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, overflowX: 'auto' }}>
        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, paddingRight: 4 }}>{orgName || 'Расчёт'}</span>
        {tabs.map(tb => {
          const on = tb.id === id
          return on ? (
            <div key={tb.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 7, flexShrink: 0, background: '#fff', boxShadow: `0 0 0 1.5px ${COLORS.primary}` }}>
              <input value={name} onChange={e => commit(brands, rows, e.target.value)} title="Имя расчёта" style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, width: Math.max(80, (name || '').length * 7.4 + 12) }} />
              {tabs.length > 1 && <span onClick={() => removeTab(tb.id)} title="Удалить расчёт" style={{ color: '#c1121c', fontSize: 12, cursor: 'pointer' }}>✕</span>}
            </div>
          ) : (
            <div key={tb.id} onClick={() => open(tb.id)} style={{ padding: '4px 8px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, background: '#f1efec', color: COLORS.textMuted, fontSize: 12.5 }}>{tb.name || 'Расчёт'}</div>
          )
        })}
        <button onClick={addTab} title="Новый расчёт для клиента (пустой, 12 строк)" style={{ flexShrink: 0, padding: '4px 9px', borderRadius: 7, border: `1px dashed ${COLORS.border}`, background: 'transparent', color: COLORS.textMuted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>+ новый</button>
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11.5, color: saved ? '#2e8a5e' : COLORS.textMuted }}>{saved ? '✓ сохранено' : '…'}</span>
        {/* Полный экран: касса на всё окно, без меню слева. Выход — такая же заметная красная кнопка. */}
        <button onClick={() => full ? exitFull() : enterFull()} title={full ? 'Выйти из полного экрана (Esc)' : 'Касса на весь экран — меню скроется'}
          style={{ flexShrink: 0, padding: '9px 18px', borderRadius: 10, border: 'none', background: full ? '#c1121c' : '#211f1c', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
          {full ? '✕ Выйти из полного экрана' : '⛶ Во весь экран'}
        </button>
        <button onClick={addBrand} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 7, border: 'none', background: '#eef2ff', color: '#4f46e5', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>+ фирма</button>
      </div>

      {/* Фильтр каталога (как в кассе): задаёт область, внутри которой ищет каждая строка. */}
      <CatalogFilterBar products={products} sel={sel} onChange={setSel} allColors={allColors} onAllColors={setAllColors}
        extra={(() => {
          const n = (activeFolder ? filterProducts(products, activeFolder, sel, '', 60) : []).length
          return <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={savePrices} title="Записать цены из листа в номенклатуру (розница этой орг) — потом подтянутся сами" style={{ border: '1px solid #cfeadd', background: '#eaf7f0', color: '#2e8a5e', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>💾 цены в номенклатуру</button>
            <button onClick={pullPrices} title="Подтянуть розничные цены из номенклатуры к строкам, где цена пустая" style={{ border: '1px solid #cdb6e2', background: '#f7f3fc', color: '#7a3aaa', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>💲 подтянуть цены</button>
            {pullMsg ? <span style={{ fontSize: 11.5, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{pullMsg}</span> : null}
            {n ? <button onClick={insertKit} title="Вставить все позиции выбранного набора в строки — останется проставить количества" style={{ border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>📦 вставить комплект · {n}</button> : null}
          </span>
        })()} />

      {/* Рабочее место кассира: слева лист-таблица, справа липкая панель «Чек». */}
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'minmax(0,1fr) 392px' : '1fr', gap: 12, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: `0 0 0 1.5px ${COLORS.border}` }}>
        {/* Ширины колонок заданы явно: всё лишнее место достаётся «Наименованию»,
            а «Кол-во» и цены остаются узкими (иначе таблица растягивала их на пол-экрана). */}
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: 450 + (noBrands ? 210 : 0) + brands.reduce((s, b) => s + (b.hidden ? 30 : 188), 0) }}>
          <colgroup>
            <col style={{ width: 38 }} />
            <col />
            <col style={{ width: 78 }} />
            {bcol && <col style={{ width: 86 }} />}
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
                  {!bcol && <button onClick={() => setBcol(true)} title="Показать колонку «Бонус» (товар соседа)" style={{ border: `1px solid #e6c9b8`, background: '#fff6ee', color: '#8a4a22', borderRadius: 6, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '5px 8px', fontFamily: 'inherit' }}>👁</button>}
                </span>
              </th>
              {/* Бонус: сколько штук взяли у соседа. Прибыль по ним делится 50/50 с головным. */}
              {bcol && (
                <th style={{ ...th, background: '#f8e7d8', color: '#8a4a22' }} rowSpan={2}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                    🤝 Бонус
                    <button onClick={() => setBcol(false)} title="Скрыть колонку «Бонус»" style={{ border: '1px solid #e6c9b8', background: '#fff', color: '#8a4a22', borderRadius: 6, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '5px 7px', fontFamily: 'inherit' }}>🙈</button>
                  </span>
                </th>
              )}
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
              <tr key={r.id}
                draggable={dragRow !== null}
                onDragStart={() => setDragRow(r.id)}
                onDragEnd={() => setDragRow(null)}
                onDragOver={e => { if (dragRow) e.preventDefault() }}
                onDrop={e => { e.preventDefault(); if (dragRow && dragRow !== r.id) moveRow(dragRow, r.id); setDragRow(null) }}
                style={{ background: dragRow === r.id ? '#fff3ee' : (i === curRow ? '#fff6e0' : (i % 2 ? '#fafafa' : '#fff')), boxShadow: i === curRow ? `inset 0 0 0 2px ${COLORS.primary}55` : 'none' }}>
                {/* Тянем строку за номер: зажал ⠿ — перетащил на нужное место. */}
                <td style={{ ...td, textAlign: 'center', color: COLORS.textMuted, cursor: 'grab', userSelect: 'none' }}
                  title="Перетащите, чтобы переставить строку"
                  onMouseDown={() => setDragRow(r.id)} onMouseUp={() => setDragRow(d => d === r.id ? null : d)}>
                  {dragRow === r.id ? '⠿' : i + 1}
                </td>
                {/* Поиск по названию внутри выбранного сверху фильтра: набираешь — выпадают товары. */}
                <td style={{ ...td, position: 'relative' }}>
                  <input id={cellId(i, 0)} autoComplete="off" autoCorrect="off" spellCheck={false} name={`calc-name-${i}`} value={r.name} onChange={e => { setRow(i, { name: e.target.value }); openSug(r.id, e.currentTarget) }}
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
                  {/* Бонусный товар (взят у соседа): цена соседа + у кого взяли — без них чек не пробьётся.
                      Полоса живёт ВНУТРИ ячейки названия: отдельная строка с colSpan ломала ширину колонок. */}
                  {/* Вписал цену соседа — прячет полосу глазком, чтобы клиент не видел её за плечом. */}
                  {bonQty(r) > 0 && r.bonusHid && (
                    <button onClick={() => setRow(i, { bonusHid: false })} title="Показать строку товара соседа"
                      style={{ marginTop: 3, border: '1px solid #f0dcc9', background: '#fff6ee', color: '#c0532a', borderRadius: 7, padding: '1px 7px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>👁</button>
                  )}
                  {bonQty(r) > 0 && !r.bonusHid && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontSize: 12, marginTop: 4, padding: '4px 6px', background: '#fff6ee', border: '1px solid #f0dcc9', borderRadius: 8 }}>
                      <span style={{ color: '#c0532a', fontWeight: 700, whiteSpace: 'nowrap' }}>🤝 {fmt(bonQty(r))} {r.unit || 'шт'} у соседа</span>
                      <span style={{ color: COLORS.textMuted, whiteSpace: 'nowrap' }}>цена соседа</span>
                      <input value={Number(r.bonusCost) ? String(Number(r.bonusCost)) : ''} inputMode="decimal" autoComplete="off" placeholder="0"
                        onChange={e => setRow(i, { bonusCost: num(e.target.value) })}
                        style={{ width: 78, padding: '3px 6px', borderRadius: 7, border: '1.5px solid #eab59a', fontSize: 13, fontWeight: 700, fontFamily: 'Consolas, monospace', textAlign: 'right', background: '#fff' }} />
                      <button onClick={() => setBonusPick(r.id)}
                        style={{ border: 'none', background: '#efeaf8', color: r.bonusAgentId ? '#5b4a8a' : '#a09889', borderRadius: 7, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cags.find((c: any) => c.id === r.bonusAgentId)?.name || 'у кого взяли ▾'}
                      </button>
                      {Number(r.bonusCost) > 0
                        ? (() => { const b = Math.max(0, (Number(r.prices?.[priceKeyOf()]) || 0) - Number(r.bonusCost)) * bonQty(r)
                            return <span style={{ color: '#2e8a5e', fontWeight: 700, whiteSpace: 'nowrap' }}>{`бонус ${fmt(b)} · вам ${fmt(b - Math.round(b * 0.5))} · ГО ${fmt(Math.round(b * 0.5))}`}</span> })()
                        : <span style={{ color: '#c0532a', whiteSpace: 'nowrap' }}>впишите цену соседа</span>}
                      <button onClick={() => setRow(i, { bonusHid: true })} title="Скрыть строку товара соседа"
                        style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#a09889', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '2px 4px' }}>🙈</button>
                    </div>
                  )}
                </td>
                <td style={{ ...td, background: '#f4f3f0' }}><input id={cellId(i, 1)} autoComplete="off" value={Number(r.qty) ? String(Number(r.qty)) : ''} inputMode="decimal" onFocus={() => setCurRow(i)} onKeyDown={e => cellKey(e, i, 1, () => setRow(i, { qty: 0 }))} onChange={e => setRow(i, { qty: num(e.target.value) })} placeholder="0" style={numInp} /></td>
                {/* Бонус: штуки соседа. Вписал — под названием сама выходит строка с ценой соседа. */}
                {bcol && (
                  <td style={{ ...td, background: '#fff6ee' }} title="Сколько штук взяли у соседа — прибыль по ним 50/50">
                    {isBonusRow(r)
                      ? <span style={{ ...numInp, display: 'block', color: '#8a4a22', fontWeight: 800 } as any}>{Number(r.qty) ? fmt(Number(r.qty)) : '—'}</span>
                      : <input id={cellId(i, 2)} autoComplete="off" value={Number(r.bqty) ? String(Number(r.bqty)) : ''} inputMode="decimal" onFocus={() => setCurRow(i)} onKeyDown={e => cellKey(e, i, 2, () => setRow(i, { bqty: 0 }))} onChange={e => setRow(i, { bqty: num(e.target.value) })} placeholder="0" style={{ ...numInp, color: '#8a4a22' }} />}
                  </td>
                )}
                {noBrands && <>
                  <td style={td}><input id={cellId(i, priceC0)} autoComplete="off" value={Number(r.prices?.[SELF]) ? String(Number(r.prices[SELF])) : ''} inputMode="decimal" onFocus={() => setCurRow(i)} onKeyDown={e => cellKey(e, i, priceC0, () => setPrice(i, SELF, ''))} onChange={e => setPrice(i, SELF, e.target.value)} placeholder="0" style={numInp} /></td>
                  <td style={{ ...td, background: '#f8f7f4', textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>{(Number(r.prices?.[SELF]) || 0) * totQty(r) ? fmt((Number(r.prices[SELF]) || 0) * totQty(r)) : ''}</td>
                </>}
                {brands.map(b => b.hidden
                  ? <td key={b.id} style={{ ...td, background: tint(b.color, '10') }} />
                  : (
                  <Fragment key={b.id}>
                    <td style={{ ...td, background: tint(b.color, '10') }}><input autoComplete="off" id={cellId(i, priceC0 + visBrands.findIndex((x: any) => x.id === b.id))} value={Number(r.prices?.[b.id]) ? String(Number(r.prices[b.id])) : ''} inputMode="decimal" onFocus={() => setCurRow(i)} onKeyDown={e => cellKey(e, i, priceC0 + visBrands.findIndex((x: any) => x.id === b.id), () => setPrice(i, b.id, ''))} onChange={e => setPrice(i, b.id, e.target.value)} placeholder="0" style={numInp} /></td>
                    <td style={{ ...td, background: tint(b.color, '1f'), textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>{sumOf(r, b) ? fmt(sumOf(r, b)) : ''}</td>
                  </Fragment>
                ))}
                <td style={{ ...td, textAlign: 'center' }}><button onClick={() => delRow(i)} title="Убрать строку" style={{ border: 'none', background: 'transparent', color: '#b3261e', cursor: 'pointer', fontWeight: 700 }}>✕</button></td>
              </tr>
            ))}
            {/* Итого */}
            <tr style={{ background: '#fff7d6', fontWeight: 800 }}>
              <td style={td}></td>
              <td style={td}>{noBrands ? 'ИТОГО' : 'ИТОГО по фирме'}{sellRows.length ? ` · ${sellRows.length} поз.` : ''}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{qtyTotal ? fmt(qtyTotal) : ''}</td>
              {bcol && <td style={{ ...td, textAlign: 'right', fontFamily: 'Consolas, monospace', background: '#fff6ee', color: '#8a4a22' }}>{bonQtyTotal ? fmt(bonQtyTotal) : ''}</td>}
              {noBrands && <>
                <td style={td}></td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'Consolas, monospace', background: '#f4f3f0' }}>{fmt(rows.reduce((s, r) => s + (Number(r.prices?.[SELF]) || 0) * totQty(r), 0))}</td>
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

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={addRow} style={{ padding: '9px 16px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, background: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>+ Добавить строку</button>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>стрелки — по ячейкам · Del — очистить ячейку · F9 — пробить чек</span>
      </div>
      </div>

      {/* ── ПАНЕЛЬ «ЧЕК» (рабочее место кассира за компьютером): покупатель, скидка,
             смешанная оплата по счетам и сдача. Стоит справа и всегда видна. ── */}
      <aside style={{ position: wide ? 'sticky' : 'static', top: 12, background: '#fff', borderRadius: 14, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={{ fontSize: 15 }}>🧾 Чек</b>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>{sellRows.length ? `${sellRows.length} поз. · ${fmt(qtyTotal)} шт` : 'впишите кол-во и цену'}</span>
        </div>

        {bonusRowsCart.length > 0 && (
          <div style={{ background: '#fff6ee', border: '1px solid #e6c9b8', borderRadius: 9, padding: '7px 10px', fontSize: 12, color: '#8a4a22', fontWeight: 700 }}>
            {bonusBad
              ? `⚠ ${bonusBad.name}: впишите цену соседа и у кого взяли`
              : `🤝 бонус 50/50 — ${fmt(bonusSum)} ₸ · вам ${fmt(bonusSum - bonusHq)} · Адал Строй 2 ${fmt(bonusHq)} · соседу вернуть ${fmt(bonusToAgent)} ₸`}
          </div>
        )}

        <ContragentPicker contragents={cags} value={sellContact} onPick={(c: any) => setSellContact(c?.id || '')} placeholder="— покупатель (для долга обязателен) —" />

        {/* Кто пробил чек: по умолчанию тот, кто выбран за кассой на этом устройстве. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted, width: 62, flex: 'none' }}>Продавец</span>
          <select value={sellerId} onChange={e => { setSellerId(e.target.value); const s = staff.find((x: any) => x.id === e.target.value); try { localStorage.setItem(`u2b_seller_${orgId}`, JSON.stringify(s ? { id: s.id, name: s.name } : null)) } catch {} }}
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: 'inherit', fontWeight: 600, background: '#fff' }}>
            <option value="">— не указан —</option>
            {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ''}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted, width: 62, flex: 'none' }}>Код чека</span>
          <input value={sellCode} inputMode="numeric" onChange={e => setSellCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="последние 4 цифры телефона" style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: 'inherit', fontWeight: 700 }} />
        </div>

        {/* Скидка по чеку: ₸ или % — к оплате = позиции − скидка. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted, width: 62, flex: 'none' }}>Скидка</span>
          <div style={{ display: 'flex', border: `1.5px solid ${COLORS.border}`, borderRadius: 9, overflow: 'hidden' }}>
            {(['sum', 'pct'] as const).map(mo => (
              <button key={mo} onClick={() => setDisc(d => ({ ...d, mode: mo }))}
                style={{ border: 'none', background: disc.mode === mo ? COLORS.primary : '#fff', color: disc.mode === mo ? '#fff' : '#6b645b', padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800 }}>{mo === 'sum' ? '₸' : '%'}</button>
            ))}
          </div>
          <input value={disc.val} inputMode="decimal" placeholder="0" onChange={e => setDisc(d => ({ ...d, val: e.target.value.replace(/[^0-9.,]/g, '') }))}
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'Consolas, monospace', fontWeight: 800, textAlign: 'right' }} />
          {discSum > 0 && <span style={{ fontSize: 12.5, color: '#c0532a', fontWeight: 800, whiteSpace: 'nowrap' }}>−{fmt(discSum)}</span>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 12px', borderRadius: 11, background: '#f4f3f0' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>К оплате</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            {discSum > 0 && <span style={{ fontSize: 13, color: '#a09889', textDecoration: 'line-through' }}>{fmt(sellTotal)}</span>}
            <b style={{ fontSize: 25, fontFamily: 'Consolas, monospace' }}>{fmt(net)}</b>
          </span>
        </div>

        {/* СМЕШАННАЯ ОПЛАТА: сумма по каждому способу; «всё/остаток» добивает до итога. */}
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 700 }}>Оплата (можно смешанно)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '98px 1fr 64px', gap: 6, alignItems: 'center' }}>
          {([
            ['cash', '💵 Нал', '#e7f6ec', '#19653c', 'всё'],
            ['kaspi', 'Каспи', '#eaf1fb', '#15447c', 'всё'],
            ['qr', 'QR', '#f3edfb', '#4a2a7a', 'всё'],
            ['debt', 'Долг', '#fff2e8', '#9a4a1e', 'остаток'],
          ] as const).map(([k, label, bg, fg, btn]) => (
            <Fragment key={k}>
              <div style={{ background: bg, color: fg, fontWeight: 800, fontSize: 13, padding: '8px 6px', borderRadius: 9, textAlign: 'center' }}>{label}</div>
              <input value={(pay as any)[k]} inputMode="decimal" placeholder="0"
                onChange={e => setPay(p => ({ ...p, [k]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 16, fontFamily: 'Consolas, monospace', fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} />
              <button onClick={() => fillPay(k)} title={`Добить «${label}» до итога`}
                style={{ padding: '8px 4px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: '#fff', color: '#5f5952', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{btn}</button>
            </Fragment>
          ))}
        </div>

        {/* Сверка: пока оплата не сошлась с итогом — чек не пробивается. */}
        {net > 0 && (
          Math.abs(rest) < 0.5
            ? <div style={{ background: '#e7f6ec', border: '1px solid #bfe3cb', color: '#19653c', borderRadius: 9, padding: '7px 10px', fontSize: 12.5, fontWeight: 700 }}>✓ распределено {fmt(net)} из {fmt(net)}{pDebt > 0 ? ` · долг ${fmt(pDebt)} ₸ на покупателя` : ''}</div>
            : <div style={{ background: '#fff6ee', border: '1px solid #e6c9b8', color: '#8a4a22', borderRadius: 9, padding: '7px 10px', fontSize: 12.5, fontWeight: 700 }}>{rest > 0 ? `осталось распределить ${fmt(rest)} ₸` : `перебор на ${fmt(-rest)} ₸`}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted, width: 62, flex: 'none' }}>Дали нал</span>
          <input value={given} inputMode="decimal" placeholder="0" onChange={e => setGiven(e.target.value.replace(/[^0-9.,]/g, ''))}
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'Consolas, monospace', fontWeight: 800, textAlign: 'right' }} />
          <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', color: change > 0 ? '#19653c' : COLORS.textMuted }}>сдача {fmt(change)}</span>
        </div>

        <button onClick={doSell} disabled={!canSell}
          style={{ border: 'none', background: canSell ? '#2e8a5e' : '#cfd8d2', color: '#fff', borderRadius: 12, padding: '15px 10px', cursor: canSell ? 'pointer' : 'default', fontSize: 16.5, fontWeight: 800, fontFamily: 'inherit' }}>
          {selling ? '…' : `💵 Пробить чек · ${fmt(net)} ₸ · F9`}
        </button>
        {/* Прочий доход: деньги без товара (услуга, доставка, мелочь) — на счета и 50/50 с головным. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={incNote} onChange={e => setIncNote(e.target.value)} placeholder="за что (необязательно)"
            style={{ flex: 1, minWidth: 0, padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }} />
          <button onClick={doOtherIncome} disabled={selling || !(pCash + pKaspi + pQr > 0)} title="Деньги без товара: на счета + прибыль 50/50 с Адал Строй 2"
            style={{ flex: 'none', border: '1.5px solid #cdb6e2', background: (selling || !(pCash + pKaspi + pQr > 0)) ? '#f3f1ee' : '#f7f3fc', color: (selling || !(pCash + pKaspi + pQr > 0)) ? '#a09889' : '#7a3aaa', borderRadius: 10, padding: '11px 14px', cursor: (selling || !(pCash + pKaspi + pQr > 0)) ? 'default' : 'pointer', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            ➕ Прочий доход{pCash + pKaspi + pQr > 0 ? ` · ${fmt(pCash + pKaspi + pQr)} ₸` : ''}
          </button>
        </div>
        {sellMsg && <div style={{ fontSize: 13, fontWeight: 700, color: sellMsg.startsWith('✓') ? '#2e8a5e' : COLORS.primaryDark }}>{sellMsg}</div>}
        <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>Склад филиала списывается, деньги ложатся на счета по строкам оплаты. Строки без цены или количества в чек не идут.</div>
      </aside>
      </div>

      {/* У кого взяли бонусный товар — выбор соседа из контрагентов магазина. */}
      {bonusPick && (
        <div onClick={() => setBonusPick(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(38,35,31,.45)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 16, width: 'min(460px, 92vw)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b style={{ fontSize: 15 }}>У кого взяли товар</b>
            <ContragentPicker contragents={cags} value={rows.find(r => r.id === bonusPick)?.bonusAgentId || ''}
              onPick={(c: any) => { const i = rows.findIndex(r => r.id === bonusPick); if (i >= 0) setRow(i, { bonusAgentId: c?.id || undefined }); setBonusPick(null) }} placeholder="— найти соседа —" />
            <button onClick={() => setBonusPick(null)} style={{ border: `1.5px solid ${COLORS.border}`, background: '#fff', color: COLORS.textMuted, borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Закрыть</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: COLORS.textMuted }}>Сумма = Цена × Кол-во. Зелёным ✓ — самый дешёвый итог. Цены/фирмы/позиции редактируются прямо в таблице, сохраняется автоматически.</div>
    </div>
  )

  // Полный экран: рисуем кассу поверх страницы (меню админки остаётся под нами).
  // zIndex 1200 — выше меню (120), но ниже подсказок и пикеров (2000+), иначе они пропадут.
  return full
    ? createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: COLORS.bg, overflow: 'auto' }}>{body}</div>, document.body)
    : body
}
