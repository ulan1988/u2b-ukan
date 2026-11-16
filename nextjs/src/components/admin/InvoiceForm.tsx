'use client'
import { useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtDate } from '@/lib/adminFmt'
import { getDocument, updateDocument, deleteInvoiceLine, applyToChildren, createPurchase, createSale, purgeDocument } from '@/lib/api/docs'
import { listProducts, autoPrices } from '@/lib/api/refs'
import { finance } from '@/lib/api/finance'
import { matchWords } from '@/lib/search'
import { extractRal } from '@/lib/ral'
import { itemName } from '@/lib/itemName'
import StoreCatalog from '@/components/StoreCatalog'
import type { PickedPos } from '@/components/NomPicker'
import { lineAmount, isIzdelie, priceForClient as priceByType } from '@/lib/lineAmount'
import ReturnModal from '@/components/admin/ReturnModal'
import ContragentPicker from '@/components/ContragentPicker'
import { fetchRefs } from '@/lib/api/refs'

// «20.000 см» → «20 см» для показа (лишние нули из имени товара)
const cleanNm = (s: string) => String(s || '').replace(/(\d+)\.0+(\s*см)/gi, '$1$2')
const cmOf = (l: any) => { const n = Number(l?.widthCm); return n > 0 ? String(n) : '' }
const r2 = (v: any) => Math.round((Number(v) || 0) * 100) / 100
const r6 = (v: any) => Math.round((Number(v) || 0) * 1e6) / 1e6
// Сумма строки: вписанная руками (накладная поставщика даётся суммами) или кол-во×цена.
const amtOf = (l: any) => (l.amount != null && l.amount !== '' ? r2(l.amount) : lineAmount({ name: l.name, qty: Number(l.qty) || 0, price: Number(l.price) || 0, widthCm: l.widthCm }))
const m2 = (v: number) => (Number(v) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Форма накладной (1С УНФ), зеркальная: приходная (закуп) и расходная (продажа).
// Тип определяется по doc.type. Правим «бумажные» поля: вх.номер/дата (только приходная),
// операция, скидка, оплата, коммент + цена/ед./коммент строк.
// Кол-во/склад менять нельзя (это движение склада — отдельный шаг).
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#5f5952', marginBottom: 3, display: 'block', letterSpacing: '.03em' }
const OPS_IN = [{ v: 'receipt', l: 'Поступление от поставщика' }, { v: 'return', l: 'Возврат поставщику' }]
const OPS_OUT = [{ v: 'shipment', l: 'Продажа покупателю' }, { v: 'return', l: 'Возврат от покупателя' }]

// Та же форма работает и на СОЗДАНИЕ накладной (createKind + orgId вместо id): шапка,
// блоки, строки, скидка и оплата — один в один как у проведённой, плюс каталог и поиск.
// fromId — создать копией выделенной накладной: подставляем её шапку (контрагент, склад,
// операция), а с withLines — ещё и строки («создать на основании»).
export default function InvoiceForm({ id, createKind, orgId: newOrgId, fromId, withLines, linesOnly, opening, onClose, onSaved, drawer = false }: { id?: string; createKind?: 'purchase' | 'sale'; orgId?: string; fromId?: string; withLines?: boolean; linesOnly?: boolean; opening?: boolean; onClose: () => void; onSaved?: () => void; drawer?: boolean }) {
  const creating = !id && !!createKind
  const newType = createKind === 'sale' ? 'sale' : 'purchase'
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState<'goods' | 'pay'>('goods')
  const [f, setF] = useState<any>({})            // редактируемая шапка
  const [lines, setLines] = useState<any[]>([])  // редактируемые строки
  const [discMode, setDiscMode] = useState<'pct' | 'sum'>('pct')
  const [priceCm, setPriceCm] = useState<string>('')   // одна цена за см на все изделия (см. калькулятор)
  const [blocks, setBlocks] = useState<string[]>([])    // блоки внутри накладной (= накладные поставщика)
  const [dragId, setDragId] = useState<string | null>(null)   // перетаскиваемая строка
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [returning, setReturning] = useState(false)
  const [cags, setCags] = useState<any[]>([])   // контрагенты орг накладной — чтобы править ошибочного
  // ── режим создания ───────────────────────────────────────────────────────────
  const [products, setProducts] = useState<any[]>([])
  const [whs, setWhs] = useState<any[]>([])
  const [whId, setWhId] = useState('')
  const [recId, setRecId] = useState('')          // получатель прихода (товар сразу уйдёт ему)
  // ДОЛГ К ГОЛОВНОМУ в расходной филиала: накладная выписывается на мост «Адал Строй 2»,
  // а заказчик уходит дальше — у головного зеркальная приходная сразу отгружается ему.
  const [hqBridgeId, setHqBridgeId] = useState('')
  const [debtHq, setDebtHq] = useState(false)
  // Долги контрагентов этой орг: рядом с покупателем сразу видно, сколько он должен,
  // и по клику открывается его акт сверки в У-Канбане.
  const [debts, setDebts] = useState<Record<string, { theyOwe: number; weOwe: number }>>({})
  const [recPrices, setRecPrices] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [showCatalog, setShowCatalog] = useState(false)
  const [seq, setSeq] = useState(1)               // локальная нумерация новых строк
  // ЗАМЕНА ТОВАРА в проведённой строке (ошиблись номенклатурой при приёмке).
  const [swapFor, setSwapFor] = useState('')      // id строки, у которой открыт выбор товара
  const origProd = useRef<Record<string, string>>({})   // товар строки на момент загрузки

  function reload() { return getDocument(id as string).then((d: any) => {
    if (!d) return
    setData(d)
    setF({ number: d.doc.number || '', date: d.doc.date ? String(d.doc.date).slice(0, 10) : '', inNumber: d.doc.inNumber || '', inDate: d.doc.inDate || '', operation: d.doc.operation || (d.doc.type === 'sale' ? 'shipment' : 'receipt'), contragentId: d.doc.contragentId || '', supplierId: d.doc.supplierId || '', comment: d.doc.comment || '', discountPct: Number(d.doc.discountPct) || 0, discountSum: Number(d.doc.discountSum) || 0, paidSum: Number(d.doc.paidSum) || 0, reviewed: !!d.doc.reviewed })
    const mapped = (d.lines || []).map((l: any, i: number) => ({ ...l, price: Number(l.price), qty: Number(l.qty), block: l.block || '', sortOrder: l.sortOrder != null ? Number(l.sortOrder) : i }))
    setLines(mapped)
    origProd.current = Object.fromEntries(mapped.map((l: any) => [l.id, String(l.productId || '')]))
    setBlocks(Array.from(new Set(mapped.map((l: any) => l.block).filter(Boolean))) as string[])
    const izd = mapped.find((l: any) => isIzdelie(l.name) && Number(l.price) > 0)   // цена за см (общая) — из первой изделия
    setPriceCm(izd ? String(Number(izd.price)) : '')
  }) }
  useEffect(() => {
    if (!creating) { reload(); return }
    // Новая накладная: тот же шаблон, но пустой. Номер — авто (можно вписать свой).
    const today = new Date().toISOString().slice(0, 10)
    setData({ doc: { type: newType, number: '', status: 'new', orgId: newOrgId }, lines: [], warehouse: null, history: [], children: [] })
    setF({ number: '', date: today, inNumber: '', inDate: '', operation: newType === 'sale' ? 'shipment' : 'receipt', contragentId: '', supplierId: '', comment: '', discountPct: 0, discountSum: 0, paidSum: 0, reviewed: false })
    setLines([]); setBlocks([])
  }, [id, creating]) // eslint-disable-line react-hooks/exhaustive-deps

  // Копия выделенной накладной: шапка (и строки, если «на основании»).
  useEffect(() => {
    if (!creating || !fromId) return
    getDocument(fromId).then((d: any) => {
      if (!d) return
      // linesOnly — «продать этот приход»: берём только товар, покупателя и операцию выбирает
      // пользователь, цены ставим ПРОДАЖНЫЕ (под тип цены покупателя, пока он не выбран — розница).
      if (!linesOnly) {
        setF((p: any) => ({ ...p, contragentId: d.doc.contragentId || '', supplierId: d.doc.supplierId || '', operation: d.doc.operation || p.operation, comment: d.doc.comment || '' }))
      }
      if (d.doc.warehouseId) setWhId(d.doc.warehouseId)
      if (!withLines && !linesOnly) return
      const mapped = (d.lines || []).map((l: any, i: number) => ({
        id: 'new-' + (i + 1), productId: l.productId, name: l.name, qty: Number(l.qty) || 0,
        unit: l.unit || 'шт', price: Number(l.price) || 0, amount: r2((Number(l.qty) || 0) * (Number(l.price) || 0)),
        widthCm: l.widthCm != null ? Number(l.widthCm) : null, comment: l.comment || '', block: linesOnly ? '' : (l.block || ''), sortOrder: i,
      })).map((l: any) => {
        if (!linesOnly) return l
        const pr = products.find((p: any) => p.id === l.productId)
        const sale = pr ? (priceByType(pr, 'retail') || Number(pr.priceRetail) || 0) : 0
        return sale > 0 ? { ...l, price: sale, amount: r2(Number(l.qty) * sale) } : l
      })
      setLines(mapped); setSeq(mapped.length + 1)
      setBlocks(Array.from(new Set(mapped.map((l: any) => l.block).filter(Boolean))) as string[])
    }).catch(() => {})
  }, [creating, fromId, withLines, linesOnly, products.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Справочники для создания: товары (поиск/каталог) и склады орг.
  useEffect(() => {
    if (!creating || !newOrgId) return
    listProducts(newOrgId).then((ps: any) => setProducts(Array.isArray(ps) ? ps : [])).catch(() => {})
    fetchRefs(newOrgId).then((r: any) => {
      const w = ((r.warehouses || []) as any[]).filter(x => x.orgId === newOrgId)
      setWhs(w); setWhId((w.find((x: any) => x.isCentral) || w[0])?.id || '')
      const me = ((r.organizations || []) as any[]).find(o => o.id === newOrgId)
      const hq = ((r.organizations || []) as any[]).find(o => o.kind === 'hq')
      // Мост на головного есть только у филиала — у самого ГО кнопки «долг к головному» нет.
      if (hq && me && me.kind !== 'hq') setHqBridgeId((((r.contragents || []) as any[]).find(c => c.orgId === newOrgId && c.orgRefId === hq.id && !c.archived) || {}).id || '')
    }).catch(() => {})
  }, [creating, newOrgId])

  // Цены ПОЛУЧАТЕЛЯ (его тип цены) — сразу видно, на какую сумму уйдёт отгрузка.
  useEffect(() => {
    const ids = lines.map(l => l.productId).filter(Boolean)
    if (!creating || newType !== 'purchase' || !recId || !ids.length) { setRecPrices({}); return }
    autoPrices(ids, recId).then((m: any) => setRecPrices(m && typeof m === 'object' ? m : {})).catch(() => setRecPrices({}))
  }, [creating, newType, recId, lines.map(l => l.productId).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const org = data?.doc?.orgId || newOrgId; if (!org) return
    finance(org).then((r: any) => {
      const m: Record<string, { theyOwe: number; weOwe: number }> = {}
      for (const c of ((r?.contragents || []) as any[])) m[c.id] = { theyOwe: Number(c.theyOwe) || 0, weOwe: Number(c.weOwe) || 0 }
      setDebts(m)
    }).catch(() => {})
  }, [data?.doc?.orgId, newOrgId])

  // НАЧАЛЬНЫЙ ОСТАТОК: тот же приход, только контрагент — технический «Начальный остаток»,
  // а дату ставит сам пользователь в календаре шапки (обычно 31.10.2026 — день переноса).
  useEffect(() => {
    if (!opening || !creating || !cags.length) return
    const op = cags.find((c: any) => /начальн/i.test(String(c.name || '')))
    setF((p: any) => ({ ...p, contragentId: p.contragentId || op?.id || '', comment: p.comment || 'Начальный остаток' }))
  }, [opening, creating, cags.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Контрагенты орг этой накладной — для выбора/правки покупателя-поставщика.
  useEffect(() => {
    const org = data?.doc?.orgId || newOrgId; if (!org) return
    fetchRefs(org).then((r: any) => setCags(((r.contragents || []) as any[]).filter(c => !c.archived).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'))))
  }, [data?.doc?.orgId])
  // Удалить ошибочную позицию из проведённой накладной (склад/итог пересчитаются).
  async function delLine(l: any) {
    if (!confirm(`Убрать позицию «${cleanNm(l.name)}» из накладной? Товар вернётся на склад, итог пересчитается.`)) return
    const r: any = await deleteInvoiceLine(id as string, l.id)
    if (r?.ok === false) { setFlash('⚠ ' + (r.error || 'Не удалось')); return }
    await reload(); onSaved?.(); setFlash('✓ Позиция убрана'); setTimeout(() => setFlash(''), 1500)
  }
  // Применить одну цену за см ко всем изделиям (у изделия price = цена за 1 см).
  const applyPriceCm = (v: string) => { setPriceCm(v); setLines(ls => ls.map(l => isIzdelie(l.name) ? { ...l, price: v } : l)) }

  // ── Блоки внутри накладной (раскладка по накладным поставщика) ──────────────────
  const addBlock = () => { const n = `Накладная ${blocks.length + 1}`; setBlocks(b => [...b, n]) }
  const renameBlock = (old: string, nn: string) => { setBlocks(b => b.map(x => x === old ? nn : x)); setLines(ls => ls.map(l => (l.block || '') === old ? { ...l, block: nn } : l)) }
  const deleteBlock = (bn: string) => { setBlocks(b => b.filter(x => x !== bn)); setLines(ls => ls.map(l => (l.block || '') === bn ? { ...l, block: '' } : l)) }
  // Перенести строку в блок targetBlock, вставив перед beforeId (или в конец блока), пересчитать порядок.
  const moveLine = (draggedId: string, targetBlock: string, beforeId: string | null) => {
    setLines(ls => {
      const arr = ls.map(l => ({ ...l }))
      const di = arr.findIndex(l => l.id === draggedId); if (di < 0) return ls
      const [dr] = arr.splice(di, 1); dr.block = targetBlock
      let at: number
      if (beforeId) { at = arr.findIndex(l => l.id === beforeId); if (at < 0) at = arr.length }
      else { let last = -1; arr.forEach((l, i) => { if ((l.block || '') === targetBlock) last = i }); at = last + 1 }
      arr.splice(at, 0, dr)
      return arr.map((l, i) => ({ ...l, sortOrder: i }))
    })
    setDragId(null)
  }
  const updLine = (lid: string, patch: any) => setLines(ls => ls.map(x => x.id === lid
    // поменяли цену — сумма считается заново (ручную сумму строки сбрасываем)
    ? { ...x, ...patch, ...(patch.price !== undefined ? { amount: undefined } : {}) }
    : x))
  // Создание: кол-во/цена пересчитывают сумму, вписанная сумма — обратно цену.
  const setQtyL = (lid: string, qty: number) => setLines(ls => ls.map(x => x.id === lid ? { ...x, qty, amount: r2(lineAmount({ name: x.name, qty, price: Number(x.price) || 0, widthCm: x.widthCm })) } : x))
  const setPriceL = (lid: string, price: number) => setLines(ls => ls.map(x => x.id === lid ? { ...x, price, amount: r2(lineAmount({ name: x.name, qty: Number(x.qty) || 0, price, widthCm: x.widthCm })) } : x))
  const setAmountL = (lid: string, amount: number) => setLines(ls => ls.map(x => {
    if (x.id !== lid) return x
    const div = (Number(x.qty) || 0) * (Number(x.widthCm) > 0 ? Number(x.widthCm) : 1)
    return { ...x, amount: r2(amount), price: div > 0 ? r6(amount / div) : x.price }
  }))
  const dropLine = (lid: string) => setLines(ls => ls.filter(x => x.id !== lid))
  // Цена по умолчанию: приход — закуп товара, расход — розница.
  // Цена продажи — по ТИПУ ЦЕНЫ ПОКУПАТЕЛЯ (спец/опт/розница) из прайса своей орг: у моста
  // «Адал Строй 2» стоит спец, значит при продаже головному подставляется спец-цена.
  const buyerPT = (cags.find((c: any) => c.id === f.contragentId)?.priceType) || 'retail'
  const priceOf = (pr: any) => (newType === 'purchase' ? Number(pr.priceIn) || 0 : (priceByType(pr, buyerPT) || Number(pr.priceRetail) || Number(pr.priceIn) || 0))
  // label — имя строки, если оно отличается от имени товара (комплектующее с цветом → базовый товар).
  // Сменили покупателя при создании — цены строк переставляются под его тип цены.
  function repriceFor(cid: string) {
    const pt = (cags.find((c: any) => c.id === cid)?.priceType) || 'retail'
    if (newType !== 'sale' || !creating) return
    setLines(ls => ls.map(l => {
      const pr = products.find((p: any) => p.id === l.productId); if (!pr) return l
      const v = priceByType(pr, pt) || 0; if (!(v > 0)) return l
      return { ...l, price: v, amount: r2(Number(l.qty) * v) }
    }))
  }
  function addProduct(pr: any, qty = 1, widthCm?: number | null, label?: string) {
    setLines(ls => {
      const i = ls.findIndex(x => x.productId === pr.id && String(x.widthCm || '') === String(widthCm || ''))
      if (i >= 0) { const n = [...ls]; const qn = Number(n[i].qty) + qty; n[i] = { ...n[i], qty: qn, amount: r2(qn * Number(n[i].price)) }; return n }
      const price = priceOf(pr)
      const id = 'new-' + (seq + ls.length)
      return [...ls, { id, productId: pr.id, name: label || pr.name, qty, unit: pr.unit || 'шт', price, amount: r2(qty * price), widthCm: widthCm ?? null, comment: '', block: '', sortOrder: ls.length }]
    })
    setSeq(x => x + 1); setQ('')
  }
  // Выбранная в каталоге позиция → товар номенклатуры (общий подбор для «добавить» и «заменить»).
  // Собрали с цветом («J - профиль дерево»), а в номенклатуре товар БЕЗ ЦВЕТА («J - профиль»):
  // по правилу цвет в номенклатуру не оседает. Берём базовый товар, чьё имя — начало собранного
  // (самый длинный), цвет остаётся в имени строки накладной.
  function resolvePicked(it: PickedPos) {
    const raw = it.name1c || it.oral || ''
    const nm = isIzdelie(raw) ? itemName({ name: raw, color: extractRal(raw), cm: it.widthCm != null ? String(it.widthCm) : '' }) : raw
    const norm = (x: string) => String(x || '').trim().toLowerCase().replace(/ё/g, 'е')
    let pr = products.find((x: any) => norm(x.name) === norm(nm)) || ((it as any).productId ? products.find((x: any) => x.id === (it as any).productId) : null)
    if (!pr) {
      pr = products.filter((x: any) => norm(x.name).length >= 3 && norm(nm).startsWith(norm(x.name) + ' '))
        .sort((a: any, b: any) => norm(b.name).length - norm(a.name).length)[0]
    }
    return { pr, nm }
  }
  // Единый каталог кассы: папки → цвет → см → кол-во.
  function addFromCatalog(items: PickedPos[]) {
    const skipped: string[] = []
    for (const it of items) {
      const { pr, nm } = resolvePicked(it)
      if (!pr) { skipped.push(nm); continue }
      addProduct(pr, Number(it.qty) || 1, it.widthCm != null ? Number(it.widthCm) : null, nm)
    }
    setShowCatalog(false)
    if (skipped.length) { setFlash('⚠ Нет в номенклатуре: ' + skipped.join(', ')); setTimeout(() => setFlash(''), 4000) }
  }
  // ЗАМЕНА ТОВАРА в строке — через ТОТ ЖЕ каталог, что и добавление (ошиблись номенклатурой).
  function swapFromCatalog(items: PickedPos[]) {
    const it = items[0]; const lid = swapFor
    setSwapFor('')
    if (!it || !lid) return
    const { pr, nm } = resolvePicked(it)
    if (!pr) { setFlash('⚠ Нет в номенклатуре: ' + nm); setTimeout(() => setFlash(''), 4000); return }
    const patch: any = { productId: pr.id, name: nm || pr.name }
    if (it.widthCm != null) patch.widthCm = Number(it.widthCm)
    if (Number(it.qty) > 0) patch.qty = Number(it.qty)
    updLine(lid, patch)
  }
  // Ошибочный документ — стереть совсем: движения склада, FIFO-связи, оплаты и зеркала
  // филиалов уходят вместе с ним, карточка-заявка отвязывается и снова ждёт проведения.
  async function purgeDoc() {
    const n = o?.number || ''
    const kids = (data?.children || []).length
    const warn = [
      `Удалить накладную ${n} НАСОВСЕМ?`, '',
      '• товар вернётся на склад (движения снимутся)',
      '• оплаты по этой накладной удалятся, долг контрагента пересчитается',
      kids ? `• вместе с ней удалятся зеркальные накладные филиалов: ${kids}` : '',
      '• карточка-заявка отвяжется и снова встанет «к учёту»', '',
      'В списке её не останется — это не сторно.',
    ].filter(Boolean).join(String.fromCharCode(10))
    if (!confirm(warn)) return
    if (!confirm(`Точно стереть ${n}? Отменить это будет нельзя.`)) return
    setBusy(true)
    const r: any = await purgeDocument(id as string)
    setBusy(false)
    if (r?.data?.ok === false || r?.error) { setFlash('⚠ ' + (r?.data?.error || r?.error || 'Не удалось')); return }
    onClose()
  }

  // Создать накладную (та же форма, только вместо «Сохранить» — проведение).
  async function createDoc() {
    // Долг к головному: покупатель — мост «Адал Строй 2», выбирать его не нужно.
    const buyerId = (newType === 'sale' && debtHq && hqBridgeId) ? hqBridgeId : f.contragentId
    if (!buyerId) { setFlash('⚠ Выберите ' + (newType === 'sale' ? 'покупателя' : 'поставщика')); return }
    if (newType === 'sale' && debtHq && !recId) { setFlash('⚠ Укажите заказчика — кому головной отгрузит товар'); return }
    if (!whId) { setFlash('⚠ Нет склада'); return }
    const good = lines.filter(l => (Number(l.qty) || 0) > 0)
    if (!good.length) { setFlash('⚠ Добавьте хотя бы одну позицию'); return }
    setBusy(true)
    const body: any = {
      orgId: newOrgId, contragentId: buyerId, warehouseId: whId, date: f.date || undefined,
      number: f.number || undefined, comment: f.comment || '', inNumber: f.inNumber || undefined, inDate: f.inDate || undefined,
      operation: f.operation, paidSum: Number(f.paidSum) || 0,
      [discMode === 'pct' ? 'discountPct' : 'discountSum']: Number(discMode === 'pct' ? f.discountPct : f.discountSum) || 0,
      lines: good.map((l, i) => ({ productId: l.productId, name: l.name, qty: Number(l.qty), price: Number(l.price) || 0, amount: amtOf(l), unit: l.unit || 'шт', widthCm: l.widthCm != null ? Number(l.widthCm) : undefined, comment: l.comment || '', block: l.block || '' })),
    }
    if (newType === 'purchase' && recId) body.recipientId = recId
    if (newType === 'sale' && debtHq && recId) body.recipientId = recId   // заказчик для цепочки у головного
    const r: any = newType === 'purchase' ? await createPurchase(body) : await createSale(body)
    setBusy(false)
    if (r?.error || r?.ok === false) { setFlash('⚠ ' + (r.error || 'Ошибка сохранения')); return }
    onSaved?.(); onClose()
  }

  const subtotal = lines.reduce((s, l) => s + amtOf(l), 0)
  // Себестоимость продажи — верная (связанные приходные + непокрытое×price_in), приходит из API.
  const totalCost = Number(data?.cost) || 0
  const discountSum = discMode === 'pct' ? Math.round(subtotal * (Number(f.discountPct) || 0)) / 100 : (Number(f.discountSum) || 0)
  const total = Math.max(0, subtotal - discountSum)
  const remain = total - (Number(f.paidSum) || 0)

  // Централизованная правка: сохранить мать и разослать состав/кол-во/цены всем дочерним
  // накладным филиалов. Филиалы получат уведомление, их документ снова станет «не проверено».
  async function applyAll() {
    const kids = (data?.children || []) as any[]
    if (!kids.length) return
    const who = kids.map(k => `• ${k.org || '—'} · ${k.number}`).join('\n')
    if (!confirm('Применить этот состав и цены всем дочерним накладным?\n\n' + who)) return
    setBusy(true)
    await save()                                  // сперва сохраняем саму мать
    const r: any = await applyToChildren(id as string)
    setBusy(false)
    const res = r?.data || r
    if (res?.ok === false) { setFlash('⚠ ' + (res.error || 'Не удалось')); return }
    const w = (res?.warnings || []) as any[]
    setFlash(w.length
      ? `✓ Применено: ${res.synced}. ⚠ минус на складе: ${w.map((x: any) => `${x.doc} · ${x.product} (${x.left})`).join('; ')}`
      : `✓ Применено всем: ${res.synced}`)
    setTimeout(() => setFlash(''), 6000); await reload(); onSaved?.()
  }

  async function save(markReviewed?: boolean) {
    setBusy(true)
    const patch: any = {
      number: f.number, date: f.date || undefined, inNumber: f.inNumber, inDate: f.inDate || null, operation: f.operation, comment: f.comment, paidSum: Number(f.paidSum) || 0,
      contragentId: f.contragentId || undefined, supplierId: f.supplierId ?? null,
      lines: lines.map((l, i) => ({
        id: l.id, qty: Number(l.qty) || 0, price: Number(l.price) || 0, amount: amtOf(l), unit: l.unit, comment: l.comment,
        block: l.block || '', sortOrder: l.sortOrder != null ? l.sortOrder : i,
        // товар шлём ТОЛЬКО если строку переставили на другую номенклатуру
        ...(origProd.current[l.id] && origProd.current[l.id] !== String(l.productId || '') ? { productId: l.productId, name: l.name } : {}),
      })),
    }
    if (discMode === 'pct') patch.discountPct = Number(f.discountPct) || 0
    else patch.discountSum = Number(f.discountSum) || 0
    if (markReviewed) patch.reviewed = true
    const r: any = await updateDocument(id as string, patch)
    setBusy(false)
    if (r.ok !== false) {
      if (markReviewed) setF((p: any) => ({ ...p, reviewed: true }))
      // Правило домино: показываем, какие связанные накладные поехали за кол-вом/датой.
      const tail = [
        r.qtyMoved?.length ? `кол-во по цепочке: ${r.qtyMoved.join(', ')}` : '',
        r.qtySkipped?.length ? `⚠ не применено (несколько строк одного товара): ${r.qtySkipped.join(', ')}` : '',
        r.dateMoved?.length ? `дата: ${r.dateMoved.join(', ')}` : '',
      ].filter(Boolean).join(' · ')
      setFlash((markReviewed ? '✓ Проверено и сохранено' : '✓ Сохранено') + (tail ? ' · ' + tail : ''))
      setTimeout(() => setFlash(''), tail ? 6000 : 1500); await reload(); onSaved?.()
    }
    else setFlash('⚠ ' + (r.error || 'Ошибка'))
  }

  const o = data?.doc
  const isSale = o?.type === 'sale'
  // Список для общего пикера контрагентов (поиск по словам, ⭐ избранные сверху). Контрагент
  // уже проведённой накладной может быть не в списке орг — добавляем его, чтобы не пропал.
  const cagList = (() => {
    const cur = f.contragentId && !cags.some((c: any) => c.id === f.contragentId)
      ? [{ id: f.contragentId, name: data?.contragent?.name || '—' }] : []
    return [...cur, ...cags]
  })()
  const OPS = isSale ? OPS_OUT : OPS_IN
  return (
    <div onClick={onClose} style={drawer
      ? { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }
      : { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="anim-pop" style={drawer
        ? { width: 580, maxWidth: '100%', height: '100vh', background: '#fff', boxShadow: '-12px 0 48px rgba(0,0,0,.25)', overflowY: 'auto' }
        : { width: 980, maxWidth: '100%', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,.2)' }}>
        {!data ? <div style={{ padding: 48, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : (
          <>
            {/* Замена товара строки — тот же каталог, что и при добавлении. */}
            {swapFor && <StoreCatalog orgId={data?.doc?.orgId || newOrgId} onPick={swapFromCatalog} onClose={() => setSwapFor('')} />}
            {/* Шапка */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: '#fff', zIndex: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>{opening && creating ? '⚖ Начальный остаток' : (isSale ? 'Расходная накладная' : 'Приходная накладная')}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.primary }}>{creating ? 'новая' : o.number}</span>
              {!creating && <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: o.status === 'cancelled' ? '#faeaea' : '#e8f5ee', color: o.status === 'cancelled' ? '#b03020' : '#2e8a5e', fontWeight: 700 }}>{o.status === 'cancelled' ? 'отменён' : 'проведён'}</span>}
              {!creating && o.status !== 'cancelled' && !f.reviewed && <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: '#fff3cd', color: '#8a6f00', fontWeight: 700 }}>⚠ не проверено</span>}
              {o.transit && <span title="Сквозная продажа — товар шёл мимо склада (drop-ship)" style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: '#ffe8d6', color: '#c2570f', fontWeight: 700 }}>🔀 Сквозная · мимо склада</span>}
              <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>

            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div><label style={lbl}>НОМЕР (авто, можно менять)</label><input style={inp} value={f.number} onChange={e => setF({ ...f, number: e.target.value })} /></div>
              <div><label style={lbl}>{isSale ? 'ДАТА (день отгрузки)' : 'ДАТА (день приёмки)'}</label><input style={inp} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
              {/* Контрагент можно переназначить — иногда при проведении выбирают не того. */}
              <div><label style={lbl}>{isSale ? 'ПОКУПАТЕЛЬ' : 'ПОСТАВЩИК'}</label>
                {creating && isSale && debtHq && hqBridgeId
                  ? <div style={{ ...inp, background: '#f3eeff', border: '1.5px solid #e0d4f2', color: '#7a3aaa', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                      🏢 {cagList.find((c: any) => c.id === hqBridgeId)?.name || 'Адал Строй 2'} <span style={{ fontWeight: 500, color: '#9b8fb5', marginLeft: 6 }}>· долг к головному</span>
                    </div>
                  : <ContragentPicker contragents={cagList} value={f.contragentId || ''} onPick={(c: any) => { setF({ ...f, contragentId: c?.id || '' }); repriceFor(c?.id || '') }}
                  placeholder={isSale ? '— выберите покупателя —' : '— выберите поставщика —'} />}
                {/* Долг выбранного контрагента: видно сразу при выборе, клик — его акт сверки. */}
                {(() => {
                  const cid = (creating && isSale && debtHq && hqBridgeId) ? hqBridgeId : f.contragentId
                  const d = cid ? debts[cid] : null; if (!d) return null
                  const net = (d.theyOwe || 0) - (d.weOwe || 0)
                  if (!net) return <div style={{ marginTop: 5, fontSize: 12, color: '#8a8377' }}>долгов нет</div>
                  const org = data?.doc?.orgId || newOrgId
                  return (
                    <button type="button" onClick={() => { window.open(`/admin/accounting?org=${org}&mode=reconcile&cid=${cid}`, '_blank') }}
                      title="Открыть акт сверки по этому контрагенту"
                      style={{ marginTop: 5, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: net > 0 ? '#b03020' : '#2e8a5e', textDecoration: 'underline' }}>
                      {net > 0 ? `должен ${m2(net)} ₸` : `мы должны ${m2(-net)} ₸`} · акт сверки →
                    </button>
                  )
                })()}
              </div>
              {!creating && data.customer && <div><label style={lbl}>ЗАКАЗЧИК (кому товар / на кого долг)</label><input style={{ ...inp, background: '#f6f3f0' }} value={data.customer} disabled /></div>}
              {isSale && !creating && (
                <div><label style={lbl}>ПОСТАВЩИК (у кого взят товар)</label>
                  <ContragentPicker contragents={cagList} value={f.supplierId || ''} onPick={(c: any) => setF({ ...f, supplierId: c?.id || '' })}
                    placeholder={`— по закупу${data.supplier ? ': ' + data.supplier : ''} —`} />
                </div>
              )}
              <div><label style={lbl}>СКЛАД</label>{creating
                ? <select style={inp} value={whId} onChange={e => setWhId(e.target.value)}>{whs.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
                : <input style={{ ...inp, background: '#f6f3f0' }} value={data.warehouse?.name || '—'} disabled />}</div>
              {/* ДОЛГ К ГОЛОВНОМУ (расходная филиала): накладная на мост «Адал Строй 2»,
                  заказчик указывается отдельно — у головного приходная-зеркало сразу уходит
                  ему расходной, и долг ложится на заказчика. */}
              {creating && isSale && hqBridgeId && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <button type="button" onClick={() => { const v = !debtHq; setDebtHq(v); if (v) setF((p: any) => ({ ...p, contragentId: hqBridgeId })) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1.5px solid ${debtHq ? '#7a3aaa' : '#e6e2dc'}`, background: debtHq ? '#f3eeff' : '#fff', color: debtHq ? '#7a3aaa' : '#5f5952', borderRadius: 9, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', background: debtHq ? '#7a3aaa' : 'transparent', boxShadow: `inset 0 0 0 2px ${debtHq ? '#7a3aaa' : '#cfc8bf'}` }}>{debtHq ? '✓' : ''}</span>
                    🏢 Долг к головному
                  </button>
                  {debtHq && (
                    <div style={{ marginTop: 8 }}>
                      <label style={lbl}>ЗАКАЗЧИК <span style={{ fontWeight: 500, color: '#a09889' }}>(кому головной отгрузит товар — на него ляжет долг)</span></label>
                      <ContragentPicker contragents={cagList.filter((c: any) => c.id !== hqBridgeId)} value={recId}
                        onPick={(c: any) => setRecId(c?.id || '')} placeholder="— выберите заказчика —" />
                      <div style={{ marginTop: 6, fontSize: 12.5, color: '#7a3aaa', background: '#f8f5ff', border: '1px solid #e0d4f2', borderRadius: 8, padding: '7px 10px' }}>
                        После проведения: расходная на «Адал Строй 2» (ваш долг перед ним уменьшится) → у него приходная той же датой
                        {recId ? ` → его расходная на «${cagList.find((c: any) => c.id === recId)?.name}» по его ценам` : ' → укажите заказчика, иначе товар останется на складе головного'}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* ПОЛУЧАТЕЛЬ прихода: товар сразу уйдёт ему расходной этой же датой (его цены). */}
              {creating && newType === 'purchase' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>ПОЛУЧАТЕЛЬ <span style={{ fontWeight: 500, color: '#a09889' }}>(необязательно — товар сразу уйдёт ему этой же датой)</span></label>
                  <ContragentPicker contragents={cagList.filter((c: any) => c.id !== f.contragentId)} value={recId}
                    onPick={(c: any) => setRecId(c?.id || '')} placeholder="— остаётся на складе —" />
                  {recId && (
                    <div style={{ marginTop: 6, fontSize: 12.5, color: '#2e8a5e', background: '#f2fbf6', border: '1px solid #cfe6d8', borderRadius: 8, padding: '7px 10px' }}>
                      📦 После проведения: приход на склад → расходная на «{cags.find((c: any) => c.id === recId)?.name}» той же датой
                      {lines.length > 0 ? ` на ${m2(lines.reduce((sm, l) => sm + (Number(l.qty) || 0) * (recPrices[l.productId] || Number(l.price) || 0), 0))} ₸ (его цены)` : ''}
                    </div>
                  )}
                </div>
              )}
              {!isSale && <div><label style={lbl}>ВХ. НОМЕР</label><input style={inp} value={f.inNumber} onChange={e => setF({ ...f, inNumber: e.target.value })} placeholder="№ накладной поставщика" /></div>}
              {!isSale && <div><label style={lbl}>ВХ. ДАТА</label><input style={inp} type="date" value={f.inDate ? String(f.inDate).slice(0, 10) : ''} onChange={e => setF({ ...f, inDate: e.target.value })} /></div>}
              <div><label style={lbl}>ОПЕРАЦИЯ</label><select style={inp} value={f.operation} onChange={e => { if (e.target.value === 'return') { setReturning(true) } else setF({ ...f, operation: e.target.value }) }}>{OPS.map(op => <option key={op.v} value={op.v}>{op.l}</option>)}</select></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>КОММЕНТАРИЙ</label><input style={inp} value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} /></div>
            </div>

            {/* Журнал правок — кто и что менял (в т.ч. централизованная рассылка). */}
            {(data?.history || []).length > 0 && (
              <div style={{ margin: '0 20px 10px', background: '#faf8f6', borderRadius: 10, padding: '8px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#5f5952', marginBottom: 4, letterSpacing: '.03em' }}>ИСТОРИЯ ПРАВОК</div>
                {(data.history as any[]).slice(0, 6).map((h: any) => (
                  <div key={h.id} style={{ fontSize: 12, color: COLORS.textMuted, padding: '2px 0' }}>
                    <span style={{ fontFamily: 'Consolas, monospace' }}>{fmtDate(h.createdAt)}</span> · {h.userName} — {h.detail}
                  </div>
                ))}
              </div>
            )}

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
                {/* Создание: добавляем товар — поиск по словам и тот же каталог, что у кассы. */}
                {creating && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={{ ...inp, flex: 1 }} value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 поиск по словам: «евро 7024»…" />
                      <button onClick={() => setShowCatalog(true)} style={{ border: 'none', borderRadius: 8, padding: '0 16px', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>📖 Каталог</button>
                    </div>
                    {q.trim() && (
                      <div style={{ marginTop: 4, border: '1px solid #e6e2dc', borderRadius: 10, maxHeight: 220, overflowY: 'auto', background: '#fff' }}>
                        {products.filter((pr: any) => matchWords(q, pr.name, pr.alias)).slice(0, 30).map((pr: any) => (
                          <div key={pr.id} onClick={() => addProduct(pr)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f1ee', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                            <span>{cleanNm(pr.name)}</span>
                            <span style={{ color: COLORS.textMuted, fontSize: 12, whiteSpace: 'nowrap' }}>{m2(priceOf(pr))} ₸</span>
                          </div>
                        ))}
                        {products.filter((pr: any) => matchWords(q, pr.name, pr.alias)).length === 0 && <div style={{ padding: '10px 12px', fontSize: 12.5, color: COLORS.textMuted }}>Ничего не найдено</div>}
                      </div>
                    )}
                    {showCatalog && <StoreCatalog orgId={newOrgId} onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <button onClick={addBlock} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px dashed #b79bd6', background: '#faf5ff', color: '#7a3aaa', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>＋ Блок (накладная поставщика)</button>
                  {blocks.length > 0 && <span style={{ fontSize: 12, color: COLORS.textMuted }}>Перетаскивай строки за ⠿ между блоками</span>}
                </div>
                {(blocks.length ? ['', ...blocks] : ['']).map(bn => {
                  const gl = lines.filter(l => (l.block || '') === bn)
                  const sub = gl.reduce((s, l) => s + amtOf(l), 0)
                  const named = bn !== ''
                  return (
                    <div key={bn || '__none'} onDragOver={e => e.preventDefault()} onDrop={e => { if (dragId) moveLine(dragId, bn, null) }}
                      style={{ marginBottom: 12, border: `1.5px solid ${named ? '#e0cef0' : '#efece8'}`, borderRadius: 10, background: '#fff', overflowX: 'auto' }}>
                      {(named || blocks.length > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: named ? '#f5eefc' : '#f8f6f3', borderBottom: '1px solid #efece8' }}>
                          {named
                            ? <input value={bn} onChange={e => renameBlock(bn, e.target.value)} style={{ ...inp, width: 220, fontWeight: 700, padding: '5px 8px', borderColor: '#d8c4ec' }} />
                            : <span style={{ fontWeight: 700, fontSize: 13, color: COLORS.textMuted }}>📄 Без блока</span>}
                          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#7a3aaa' }}>Σ {m2(sub)} ₸</span>
                          {named && <button onClick={() => deleteBlock(bn)} title="Удалить блок (строки → Без блока)" style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>}
                        </div>
                      )}
                      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ color: COLORS.textMuted, fontSize: 11 }}>{['', '№', 'Номенклатура', 'Кол-во', 'Ед.', 'СМ', '₸/шт', 'Сумма', 'Коммент', ''].map((h, i) => <th key={i} style={{ textAlign: i >= 3 && i <= 7 ? 'right' : 'left', padding: '4px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {gl.length === 0 && <tr><td colSpan={10} style={{ padding: '14px 8px', textAlign: 'center', color: '#b8b1a6', fontSize: 12 }}>— перетащи строку сюда —</td></tr>}
                          {gl.map(l => { const izd = isIzdelie(l.name); return (
                            <tr key={l.id} draggable onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); if (dragId && dragId !== l.id) moveLine(dragId, l.block || '', l.id) }}
                              style={{ borderTop: '1px solid #efece8', opacity: dragId === l.id ? 0.4 : 1, background: dragId === l.id ? '#f5eefc' : undefined }}>
                              <td style={{ padding: '6px 4px', color: '#c9c2b8', cursor: 'grab', textAlign: 'center' }} title="Перетащить">⠿</td>
                              <td style={{ padding: '6px 8px', color: COLORS.textMuted }}>{(l as any).sourcePosId ? String((l as any).sourcePosId).split('-P')[1] ? 'P' + String((l as any).sourcePosId).split('-P')[1] : '' : ''}</td>
                              <td style={{ padding: '6px 8px', fontWeight: 500, position: 'relative', minWidth: 190 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>{cleanNm(l.name)}</span>
                                  {!creating && <button type="button" onClick={() => setSwapFor(l.id)}
                                    title="Заменить товар — ошиблись номенклатурой. Склад, себестоимость и связанные накладные переставятся"
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7a3aaa', fontSize: 13, lineHeight: 1, padding: 0 }}>✎</button>}
                                </div>
                                {(l as any).sourcePosId && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#a89f92' }}>{(l as any).sourcePosId}</div>}
                              </td>
                              <td style={{ padding: '6px 4px', textAlign: 'right', width: 76 }}>
                                <input style={{ ...inp, padding: '4px 6px', textAlign: 'right' }} type="number" step="any" value={l.qty || ''} placeholder="0"
                                  title={creating ? 'кол-во' : 'кол-во · при сохранении пересчитается склад, итог и связанные накладные'}
                                  onChange={e => setQtyL(l.id, Number(e.target.value))} /></td>
                              <td style={{ padding: '6px 4px', width: 60 }}><input style={{ ...inp, padding: '4px 6px', textAlign: 'center' }} value={l.unit || ''} onChange={e => updLine(l.id, { unit: e.target.value })} /></td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: izd ? '#7a3aaa' : COLORS.textMuted, whiteSpace: 'nowrap' }}>{cmOf(l) ? `${cmOf(l)} см` : '—'}</td>
                              <td style={{ padding: '6px 4px', width: 96 }}>{izd && !creating
                                ? <div style={{ textAlign: 'right', fontWeight: 600, color: '#7a3aaa', padding: '4px 6px' }} title="₸/шт = см × цена за см (задаётся сверху)">{m2((Number(cmOf(l)) || 0) * (Number(l.price) || 0))}</div>
                                : <input style={{ ...inp, padding: '4px 6px', textAlign: 'right' }} type="number" step="any" value={l.price || ''} onChange={e => setPriceL(l.id, Number(e.target.value))} placeholder="0" title="цена за единицу (до 6 знаков) — сумма пересчитается" />}</td>
                              {/* СУММУ при создании вписываем сами (как в накладной завода) — цена пересчитается. */}
                              <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', width: 130 }}>
                                <input style={{ ...inp, padding: '4px 6px', textAlign: 'right', fontWeight: 700 }} type="number" step="0.01" value={amtOf(l) || ''} placeholder="0"
                                  title="сумма строки как в накладной поставщика — цена пересчитается назад (6 знаков), копейки не теряются"
                                  onChange={e => setAmountL(l.id, Number(e.target.value))} /></td>
                              <td style={{ padding: '6px 4px', minWidth: 120 }}><input style={{ ...inp, padding: '4px 6px' }} value={l.comment || ''} onChange={e => updLine(l.id, { comment: e.target.value })} /></td>
                              <td style={{ padding: '6px 4px', width: 34, textAlign: 'center' }}><button type="button" onClick={() => creating ? dropLine(l.id) : delLine(l)} title="Убрать ошибочную позицию (товар вернётся на склад)" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b03020', fontSize: 15, lineHeight: 1 }}>🗑</button></td>
                            </tr>
                          ) })}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>{creating
                  ? 'Сумму строки можно вписать руками — цена пересчитается сама (накладная завода даётся суммами). Блоки — перетаскивай строки за ⠿.'
                  : <>Можно править <b>товар</b> (✎ у названия — если ошиблись номенклатурой), кол-во и сумму (сумму вписывай как в накладной поставщика, цена пересчитается назад — копейки не теряются). При сохранении едут склад, связки себестоимости, итог, позиция карточки и <b>связанные накладные</b> (зеркало филиала, отгрузка получателю). Склад менять нельзя. Ошибочную позицию можно убрать 🗑 (товар вернётся на склад). Блоки — перетаскивай строки за ⠿.</>}</div>
              </div>
            ) : (
              <div style={{ padding: 20, background: '#faf8f6' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 520 }}>
                  <div><label style={lbl}>ВСЕГО К ОПЛАТЕ</label><input style={{ ...inp, background: '#f6f3f0', fontWeight: 700 }} value={m2(total) + ' ₸'} disabled /></div>
                  <div><label style={lbl}>ОПЛАЧЕНО</label><input style={inp} type="number" value={f.paidSum || ''} onChange={e => setF({ ...f, paidSum: e.target.value })} placeholder="0" /></div>
                  <div><label style={lbl}>ОСТАТОК</label><input style={{ ...inp, background: '#f6f3f0', fontWeight: 700, color: remain > 0.001 ? '#b03020' : '#2e8a5e' }} value={m2(remain) + ' ₸'} disabled /></div>
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 10 }}>Свяжется с финмодулем ({isSale ? 'долг заказчика' : 'долг перед поставщиком'}) на следующем этапе.</div>
              </div>
            )}

            {/* Продажа / себестоимость / маржа (только расходная) */}
            {isSale && (
              <div style={{ padding: '10px 20px', borderTop: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', background: '#faf8f6', fontSize: 13 }}>
                <span style={{ color: COLORS.textMuted }}>Сумма продажи: <b style={{ color: COLORS.text }}>{m2(subtotal)} ₸</b></span>
                <span style={{ color: COLORS.textMuted }}>Себестоимость: <b style={{ color: COLORS.text }}>{m2(totalCost)} ₸</b></span>
                <span style={{ marginLeft: 'auto', color: '#2e8a5e', fontWeight: 700 }}>Маржа: {m2(subtotal - totalCost)} ₸{subtotal > 0 ? ` · ${Math.round((subtotal - totalCost) / subtotal * 100)}%` : ''}</span>
              </div>
            )}

            {/* Итоги + скидка */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: COLORS.textMuted }}>Подытог: <b style={{ color: COLORS.text }}>{m2(subtotal)} ₸</b></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: COLORS.textMuted }}>Скидка:</span>
                <input style={{ ...inp, width: 70, padding: '4px 6px', textAlign: 'right' }} type="number" value={(discMode === 'pct' ? f.discountPct : f.discountSum) || ''} placeholder="0"
                  onChange={e => setF({ ...f, [discMode === 'pct' ? 'discountPct' : 'discountSum']: e.target.value })} />
                <select style={{ ...inp, width: 60, padding: '4px 6px' }} value={discMode} onChange={e => setDiscMode(e.target.value as any)}>
                  <option value="pct">%</option><option value="sum">₸</option>
                </select>
                <span style={{ fontSize: 13, color: COLORS.textMuted }}>= {m2(discountSum)} ₸</span>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800 }}>Всего: {m2(total)} ₸</span>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1efec', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', position: 'sticky', bottom: 0, background: '#fff', zIndex: 6 }}>
              {flash && <span style={{ marginRight: 'auto', fontSize: 13, color: flash.startsWith('⚠') ? '#b03020' : '#2e8a5e' }}>{flash}</span>}
              {!creating && o.status !== 'cancelled' && (o.type === 'purchase' || o.type === 'sale') && <button onClick={() => setReturning(true)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6c4bf', background: '#fff', color: '#b4574c', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>↩ Вернуть</button>}
              {!creating && <button onClick={purgeDoc} disabled={busy} title="Ошибочный документ: снять движения склада и стереть его совсем"
                style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6c4bf', background: '#fff', color: '#b3261e', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>🗑 Отменить и удалить</button>}
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Закрыть</button>
              {creating && <button onClick={createDoc} disabled={busy} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 14, fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : (newType === 'sale' ? 'Создать расход' : 'Создать приход')}</button>}
              {!creating && <button onClick={() => save()} disabled={busy || o.status === 'cancelled'} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy || o.status === 'cancelled' ? 0.6 : 1 }}>{busy ? '…' : 'Сохранить'}</button>}
              {!creating && (data?.children || []).length > 0 && o.status !== 'cancelled' && (
                <button onClick={applyAll} disabled={busy} title="Разослать состав и цены дочерним накладным филиалов"
                  style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                  🌳 Применить всем ({(data.children || []).length})
                </button>
              )}
              {!creating && o.status !== 'cancelled' && !f.reviewed && <button onClick={() => save(true)} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#2e8a5e', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>✓ Проверено</button>}
            </div>
          </>
        )}
      </div>
      {returning && id && <ReturnModal docId={id} onClose={() => setReturning(false)} onDone={() => { setReturning(false); onSaved?.() }} />}
    </div>
  )
}
