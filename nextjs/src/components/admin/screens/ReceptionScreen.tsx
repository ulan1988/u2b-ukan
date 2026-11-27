'use client'
// Приёмка — форма создания заказа/закупа + списки (ожидание, стол приёмки, черновики,
// автозакуп). Логика передачи карточки — через onAction (родитель) и order.service;
// экран лишь фильтрует по screen/block/status и вызывает действия. Подкомпоненты и
// общий UI вынесены в ./reception/*.
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import NomInline from '@/components/NomInline'
import ContragentPicker from '@/components/ContragentPicker'
import { type PickedPos } from '@/components/NomPicker'
import StoreCatalog from '@/components/StoreCatalog'
import { extractRal } from '@/lib/ral'
import { today as todayYMD } from '@/lib/num'
import { itemName } from '@/lib/itemName'
import { priceForClient, isIzdelie } from '@/lib/lineAmount'
import { COLORS } from '@/lib/colors'
import { fmtDate, fmtTime, isPurchase, sourceStyle, sourceLabel, statusStyle } from '@/lib/adminFmt'
import { fetchRefs, fetchUsers, createOrder } from '@/lib/adminApi'
import { autoPrices, settings as fetchSettings, createSpecProject } from '@/lib/api/refs'
import { Btn, INP, inpSm, LBL, PAY, purple } from './reception/ui'
import PurchaseDraft from './reception/PurchaseDraft'
import ProcessingCard from './reception/ProcessingCard'
import AutoProcure from './reception/AutoProcure'

const CENTER = '🏬 Центр-Склад'
const emptyPos = () => ({ productId: '', name1c: '', widthCm: '', qty: '1', unit: 'шт', price: '', respUserId: '', supplierId: '', recipientId: '', salePrice: '', deadline: '', payment: '' })

export default function ReceptionScreen({ orders, orgId, onAction, onReload, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void
}) {
  const [products, setProducts] = useState<any[]>([])
  const [allCags, setAllCags] = useState<any[]>([])   // все контрагенты (клиент/поставщик не делим)
  const [defaultCagId, setDefaultCagId] = useState('')
  const [logists, setLogists] = useState<any[]>([])
  const [specs, setSpecs] = useState<any[]>([])
  const [flash, setFlash] = useState('')
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2000) }

  // Форма
  const [open, setOpen] = useState(false)
  // ВСЁ ОДНОЙ СТРОКОЙ (правило владельца 26.11.2026): «Создать заказ / закуп» и счётчики стоят в общей шапке,
  // рядом с «Приёмка · дата». Раньше под шапкой шли ещё две полосы (счётчики и карточка с кнопками) — около
  // 4 см экрана до первой строки списка. На узком экране (телефон, планшет) в шапку не влезет — там по-старому.
  const [bar, setBar] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1250px)')
    const upd = () => setBar(mq.matches ? document.getElementById('tb-slot') : null)
    upd(); mq.addEventListener('change', upd)
    return () => mq.removeEventListener('change', upd)
  }, [])
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale')
  const [contactId, setContactId] = useState('')
  const [specId, setSpecId] = useState('')
  const [phone, setPhone] = useState('')
  const [deadline, setDeadline] = useState('')
  // Рабочая дата карточки: по умолчанию сегодня, можно оформить прошедшим днём.
  const [workDate, setWorkDate] = useState(todayYMD())
  // Задний день: карточка проводится сразу (приход от поставщика + расход заказчику),
  // логисту отправлять нечего — об этом и говорит подпись кнопки.
  const back = workDate !== todayYMD()
  const [comment, setComment] = useState('')
  const [rows, setRows] = useState<any[]>([emptyPos()])
  const [showCatalog, setShowCatalog] = useState(false)
  const [step, setStep] = useState<'client' | 'items'>('items')   // продажа собирается по шагам
  const [transit, setTransit] = useState(false)   // сквозная продажа (drop-ship): товар мимо склада
  const [transitAgent, setTransitAgent] = useState('')   // имя сквозного агента (напр. Берик) — инфо
  const [busy, setBusy] = useState(false)
  const advRef = useRef<any>(null)   // таймер авто-перехода СМ → КОЛ-ВО (пауза после набора)

  function loadSettings() { fetchSettings(orgId).then((s: any) => { setSpecs((s.specProjects || []).filter((p: any) => p.status === 'active')); setDefaultCagId(s.defaultContragentId || '') }) }
  useEffect(() => {
    fetchRefs(orgId).then((r: any) => {
      setProducts(r.products || [])
      // Контрагенты уже отфильтрованы бэком по видящей орг (свои + головного + мосты) — не режем.
      setAllCags(r.contragents || [])
    })
    fetchUsers().then((us: any[]) => setLogists(us.filter(u => u.role === 'logist' && u.orgId === orgId)))
    loadSettings()
  }, [orgId]) // eslint-disable-line

  function openForm(k: 'sale' | 'purchase') {
    setKind(k); setOpen(true); setRows([emptyPos()])
    // Заказ собираем по шагам: сперва заказчик, каталог откроется сам после выбора.
    setStep(k === 'sale' ? 'client' : 'items'); setContactId('')
  }
  // Шаг 1 → 2: выбрали заказчика — сразу каталог, без лишних кликов.
  function pickClientStep(c: any) {
    if (!c?.id) return
    setContactId(c.id); setSpecId(''); setStep('items'); setShowCatalog(true)
  }
  // Логист по умолчанию (владелец: Бауыржан, пока не поменяет) — проставляем новым строкам.
  const defaultLogistId = () => (logists.find(l => (l.name || '').toLowerCase().includes('бауыржан')) || logists[0])?.id || ''
  const setRow = (i: number, patch: any) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  // Тип цены заказчика (розница/опт/спец) для автоподстановки. Для изделий это цена ЗА СМ.
  const clientPT = () => (allCags.find((c: any) => c.id === contactId)?.priceType) || 'retail'
  // Тип цены ПОЛУЧАТЕЛЯ строки закупа (розница/опт/спец) — по нему подставляется цена продажи;
  // получателя в строке нет → берём заказчика карточки, иначе розницу.
  const rowPT = (r: any) => (allCags.find((c: any) => c.id === r?.recipientId)?.priceType) || clientPT()
  const salePriceOf = (p: any, r: any) => (p ? priceForClient(p, rowPT(r)) : 0)
  function pickProduct(i: number, p: any) {
    const pr = kind === 'sale' ? priceForClient(p, clientPT()) : (Number(p.priceIn) || 0)
    const cost = Number(p.priceRetail) || 0
    const rt = transit || !!rows[i]?.transit
    // В ЗАКУПЕ две цены: price — закуп (в приходную), salePrice — продажа получателю (в расходную).
    const sale = kind === 'purchase' ? salePriceOf(p, rows[i]) : 0
    // В ПРОДАЖЕ тоже две цены (правило 25.11.2026): price — продажа по типу цены заказчика (в расходную),
    // costPrice — закуп из номенклатуры (в приходную поставщика). autoPrice помнит подставленное:
    // сменили заказчика — цена пересчитается, вписанную руками не трогаем.
    const buy = Number(p.priceIn) || 0
    setRow(i, {
      productId: p.id, name1c: p.name, unit: p.unit || 'шт',
      ...(p.widthCm != null ? { widthCm: String(p.widthCm) } : {}),
      price: pr > 0 ? String(pr) : '', autoPrice: pr > 0 ? String(pr) : '',
      ...(kind === 'sale' && !rt && buy > 0 ? { costPrice: String(buy) } : {}),
      ...(kind === 'purchase' ? { salePrice: sale > 0 ? String(sale) : '' } : {}),
      ...(rt && cost > 0 ? { costPrice: String(cost) } : {}),
    })
  }
  // Сменили получателя строки — цена продажи пересчитывается по его типу цены.
  function pickRowRecipient(i: number, cid: string) {
    const r = { ...rows[i], recipientId: cid }
    const prod = r.productId ? products.find((p: any) => p.id === r.productId) : null
    const sale = prod ? salePriceOf(prod, r) : 0
    setRow(i, { recipientId: cid, ...(sale > 0 ? { salePrice: String(sale) } : {}) })
  }
  const assignAllLogist = (uid: string) => uid && setRows(rs => rs.map(r => ({ ...r, respUserId: uid })))
  const assignAllSupplier = (sid: string) => sid && setRows(rs => rs.map(r => ({ ...r, supplierId: sid })))

  // Заказчика выбрали ПОСЛЕ набора позиций — пустые цены заполняем по его типу цены.
  // Вписанные руками не трогаем (иначе затрём правку).
  useEffect(() => {
    if (!contactId || !products.length) return
    setRows(rs => rs.map(r => {
      if (!r.productId) return r
      const cur = String(r.price || '').trim()
      if (cur && cur !== String(r.autoPrice || '')) return r   // вписано руками — не трогаем
      const p = products.find((x: any) => x.id === r.productId); if (!p) return r
      const v = kind === 'sale' ? priceForClient(p, clientPT()) : (Number(p.priceIn) || 0)
      // У нового заказчика другой тип цены: подставленная цена меняется на его; нет в прайсе — пусто (впишут).
      return v > 0 ? { ...r, price: String(v), autoPrice: String(v) } : (cur ? { ...r, price: '', autoPrice: '' } : r)
    }))
  }, [contactId, products.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pullPrices() {
    // ЗАКУП: обе колонки сразу — закуп из карточки товара (price_in), продажа из прайса по
    // типу цены получателя строки (иначе заказчика карточки). Продажа считается локально,
    // по уже загруженной номенклатуре своей орг.
    if (kind === 'purchase') {
      setRows(rs => rs.map(r => {
        const p = r.productId ? products.find((x: any) => x.id === r.productId) : null
        if (!p) return r
        const buy = Number(p.priceIn) || 0
        const sale = salePriceOf(p, r)
        return { ...r, ...(buy > 0 ? { price: String(buy) } : {}), ...(sale > 0 ? { salePrice: String(sale) } : {}) }
      }))
      toast('Цены подтянуты: закуп и продажа')
      return
    }
    const ids = rows.map(r => r.productId).filter(Boolean)
    // Изделия часто без товара 1С — подтягиваем цену и ПО ИМЕНИ (спец/опт/розница = цена за см).
    const names = rows.filter(r => !r.productId && (r.name1c || '').trim()).map(r => (r.name1c || '').trim())
    if (!ids.length && !names.length) { toast('Нет позиций для цен'); return }
    const prices: any = await autoPrices(ids, kind === 'sale' ? (contactId || undefined) : undefined, names)
    setRows(rs => rs.map(r => {
      const byId = r.productId && prices[r.productId] != null ? prices[r.productId] : null
      const nm = (r.name1c || '').trim()
      const byName = nm && prices[nm] != null ? prices[nm] : null
      const v = byId ?? byName
      return v != null ? { ...r, price: String(v) } : r
    }))
    toast('Цены подтянуты')
  }
  // ЦЕНЫ ИЗ КАТАЛОГА ПОДСТАВЛЯЮТСЯ САМИ (просьба владельца 21.11.2026): раньше позиции,
  // добавленные через «📖 Каталог», приходили с пустой ценой — в отличие от выбора строкой.
  // Продажа — цена по типу цены заказчика (розница/опт/спец), закуп — закуп из номенклатуры
  // плюс колонка «продажа» по типу цены получателя.
  const normNm = (x: string) => String(x || '').trim().toLowerCase().replace(/ё/g, 'е')
  const prodOf = (it: any, nm: string) => (it?.productId ? products.find((p: any) => p.id === it.productId) : null)
    || products.find((p: any) => normNm(p.name) === normNm(nm))
    || products.filter((p: any) => normNm(p.name).length >= 3 && normNm(nm).startsWith(normNm(p.name) + ' '))
        .sort((a: any, b: any) => b.name.length - a.name.length)[0]
  function addFromCatalog(items: PickedPos[]) {
    const log = defaultLogistId()
    setRows(rs => [...rs.filter(r => r.name1c || r.productId), ...items.map(it => {
      const cm = it.widthCm != null ? String(it.widthCm) : ''
      const raw = it.name1c || it.oral
      const nm = isIzdelie(raw) ? itemName({ name: raw, color: extractRal(raw), cm }) : raw
      const prod = prodOf(it as any, nm)
      const buy = prod ? Number(prod.priceIn) || 0 : 0
      const sale = prod ? priceForClient(prod, clientPT()) : 0
      return {
        ...emptyPos(), productId: (it as any).productId || prod?.id || undefined,
        name1c: nm, widthCm: cm, qty: String(it.qty), unit: it.unit, respUserId: log,
        price: kind === 'sale' ? (sale > 0 ? String(sale) : '') : (buy > 0 ? String(buy) : ''),
        autoPrice: kind === 'sale' ? (sale > 0 ? String(sale) : '') : (buy > 0 ? String(buy) : ''),
        ...(kind === 'sale' && buy > 0 ? { costPrice: String(buy) } : {}),
        ...(kind === 'purchase' && sale > 0 ? { salePrice: String(sale) } : {}),
      }
    })])
    setShowCatalog(false)
  }
  // Инлайн-создание проекта — сразу на выбранного клиента (Автор), чтобы попал в его фильтр.
  async function newSpec() { const name = window.prompt('Название спецпроекта'); if (!name) return; const r: any = await createSpecProject({ orgId, name, clientId: contactId || undefined }); if (r.ok || r.data?.id) { loadSettings(); if (r.data?.id) setSpecId(r.data.id); toast('Спецпроект создан') } }

  async function submit(asDraft: boolean, direct = false) {
    setBusy(true)
    const client = allCags.find(c => c.id === contactId)
    // Сквозная СТРОКА: чекбокс на позиции (r.transit) ИЛИ карточка целиком сквозная (transit).
    const rowTransit = (r: any) => !!(r.transit || transit)
    const filled = rows.filter(r => r.name1c || r.productId)
    // Формула имени (пересбор «{вид} {цвет} {см} см») — ТОЛЬКО для изделий. Реальный товар из
    // каталога оставляем как есть, иначе см/4-значное число в названии превращает его в ДРУГОЙ товар.
    const positions = filled.map(r => { const nm = isIzdelie(r.name1c) ? itemName({ name: r.name1c, color: extractRal(r.name1c), cm: r.widthCm }) : r.name1c; const tr = rowTransit(r); return ({
      productId: r.productId || undefined, name1c: nm, oral: nm, qty: Number(r.qty) || 0, unit: r.unit,
      widthCm: r.widthCm ? Number(r.widthCm) : undefined,
      price: Number(r.price) || 0, transit: tr, costPrice: (tr || (kind === 'sale' && !!r.supplierId)) ? (Number(r.costPrice) || 0) : undefined,
      respUserId: r.respUserId || undefined, supplierId: r.supplierId || undefined,
      recipientId: r.recipientId || undefined,   // кому эта позиция закупа
      salePrice: kind === 'purchase' ? (Number(r.salePrice) || 0) : undefined,   // цена продажи строки
      deadline: r.deadline || undefined, payment: r.payment || '',
    }) })
    // Карточка «целиком сквозная» только если ВСЕ строки сквозные — тогда orders.transit=true и она
    // идёт сразу к логисту, минуя автозакуп. Смешанная (часть строк сквозные) → обычный маршрут в
    // автозакуп, сквозные строки исключаются из потребности на уровне позиции.
    const allTransit = kind === 'sale' && filled.length > 0 && filled.every(rowTransit)
    // Маршрут: черновик → Входящие. Обычная/смешанная продажа → В ожидании (в АВТОЗАКУП, минуя стол
    // приёмки). Полностью сквозная продажа → сразу к логисту (закупа нет). Закуп (ручной) → стол приёмки.
    const dest = asDraft ? { screen: 'incoming', block: '' }
      : allTransit ? { screen: 'outgoing', block: '' }
      : kind === 'sale' ? { screen: 'reception', block: '' }   // В ожидании → в потребность автозакупа, но НЕ на стол приёмки
      : { screen: 'reception', block: 'processing' }
    const body: any = {
      orgId, kind, comment, phone, deadline: deadline || undefined, positions,
      specProjectId: specId || undefined, transit: allTransit, transitAgent: transitAgent || undefined,
      screen: dest.screen, block: dest.block, isDraft: asDraft,
      // Рабочая дата: карточка (и её номер) лягут этим днём — правка прошлых дней.
      ...(workDate && workDate !== todayYMD() ? { date: workDate } : {}),
    }
    // Прямой заказ: та же собранная заявка, но живёт ЗАКУПОМ ЗКП и сразу уходит логисту
    // (стол приёмки и автозакуп не нужны — поставщик уже выбран в строках).
    if (direct) { body.kind = 'purchase'; body.directOrder = true; body.screen = 'outgoing'; body.block = ''; body.isDraft = false }
    if (kind === 'sale') { body.contactId = contactId || undefined; body.fromName = client?.name || '' }
    else body.fromName = 'Центр-Склад'
    const r: any = await createOrder(body)
    setBusy(false)
    if (r.id || r.ok) { setOpen(false); setContactId(''); setSpecId(''); setPhone(''); setDeadline(''); setComment(''); setTransit(false); setTransitAgent(''); setRows([emptyPos()]); onReload(); toast(asDraft ? 'Черновик сохранён' : 'Отправлено') }
  }

  const waiting = orders.filter(o => o.screen === 'reception' && o.block !== 'processing' && !o.isCancelled)
  const processing = orders.filter(o => o.screen === 'reception' && o.block === 'processing' && !o.isCancelled)
  const purchaseDrafts = orders.filter(o => o.isDraft && isPurchase(o) && !o.isCancelled)
  const saleDrafts = orders.filter(o => o.isDraft && !isPurchase(o) && !o.isCancelled)
  const changed = orders.filter(o => o.isChanged && !o.isCancelled)
  const allDrafts = orders.filter(o => o.isDraft && !o.isCancelled)

  const counters = [
    { label: 'В ожидании', val: waiting.length, bg: '#fff0ea', color: '#c0532a' },
    { label: 'К приёму', val: processing.length, bg: '#fdf8e1', color: '#8a6f00' },
    { label: 'Изменено', val: changed.length, bg: '#faeaea', color: '#b03020' },
    { label: 'Черновики', val: allDrafts.length, bg: '#efece8', color: '#6b655b' },
  ]

  const createBtns = (['sale', 'purchase'] as const).map(k => {
    const active = open && kind === k; const isP = k === 'purchase'
    return (
      <button key={k} data-create={k} onClick={() => (active ? setOpen(false) : openForm(k))}
        style={{ padding: bar ? '7px 14px' : '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', background: active ? (isP ? purple : COLORS.primary) : '#f6f3f0', color: active ? '#fff' : (isP ? purple : COLORS.primary), boxShadow: active ? 'none' : `inset 0 0 0 1.5px ${isP ? '#e3d4f0' : '#f0d9cd'}` }}>
        ＋ {isP ? 'Создать закуп' : 'Создать заказ'}
      </button>
    )
  })
  const chips = counters.map(c => <div key={c.label} style={{ background: c.bg, color: c.color, borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label} {c.val}</div>)

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}

      {/* За компьютером кнопки и счётчики уезжают в общую шапку — одна строка на всё. */}
      {bar && createPortal(<>{createBtns}<div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{chips}</div></>, bar)}
      {/* Узкий экран: счётчики — тихие, в одну строку: название экрана уже стоит в общей шапке. */}
      {!bar && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        {chips}
      </div>}

      {/* Форма создания */}
      {/* Кнопки в шапке и форма закрыта — карточки нет совсем, список стоит сразу под шапкой. */}
      <div style={{ background: '#fff', borderRadius: 14, marginBottom: 20, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', display: bar && !open ? 'none' : 'block' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: open ? '1px solid #f1efec' : 'none' }}>
          {!bar && createBtns}
          {open && kind === 'purchase' && !transit && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: purple }}>ЗАКУП · получатель Центр-Склад</span>}
          {open && (
            <label title="Товар идёт мимо склада (drop-ship) — только деньги/долги, приход/расход склада НЕ трогается" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: kind === 'purchase' && !transit ? 0 : 'auto', fontSize: 13, fontWeight: 700, color: transit ? '#7a3aaa' : COLORS.textMuted, cursor: 'pointer', background: transit ? '#f3eeff' : 'transparent', border: `1.5px solid ${transit ? '#d8c4ec' : '#e6e2dc'}`, borderRadius: 8, padding: '6px 12px' }}>
              <input type="checkbox" checked={transit} onChange={e => setTransit(e.target.checked)} /> 🔀 Вся карточка сквозная (иначе — галочка на строке)
            </label>
          )}
          {open && transit && <input value={transitAgent} onChange={e => setTransitAgent(e.target.value)} placeholder="Сквозной агент (напр. Берик)" title="Кому реально записан долг перед поставщиком — инфо" style={{ ...INP, maxWidth: 220, borderColor: '#d8c4ec' }} />}
        </div>

        {open && step === 'client' && (
          <div style={{ padding: 20 }}>
            <label style={LBL}>ЗАКАЗЧИК · шаг 1 из 4 — дальше откроется каталог</label>
            <div style={{ maxWidth: 420 }}>
              <ContragentPicker contragents={allCags} value={contactId} defaultId={defaultCagId} onPick={pickClientStep} placeholder="— выберите заказчика —" autoOpen />
            </div>
          </div>
        )}

        {open && step === 'items' && (
          <div style={{ padding: 20 }}>
            {/* ЧЕТЫРЕ ПОЛЯ В РЯД, ДАЛЬШЕ СРАЗУ ПОЗИЦИИ (правило владельца 21.11.2026): срок и
                комментарий уехали под таблицу, чтобы экран открывался на товарах, а не на тексте. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LBL}>{kind === 'purchase' ? 'ПОЛУЧАТЕЛЬ' : 'К КОМУ (КЛИЕНТ) *'}</label>
                {kind === 'purchase'
                  ? <input style={{ ...INP, background: '#f6f3f0', color: purple, fontWeight: 700 }} value={CENTER} disabled />
                  : <ContragentPicker contragents={allCags} value={contactId} defaultId={defaultCagId} onPick={c => { setContactId(c.id); setSpecId('') }} placeholder="— выберите контрагента —" />}
                {/* ТИП ЦЕНЫ ЗАКАЗЧИКА (правило 25.11.2026): по нему подставляется цена продажи строк. */}
                {kind === 'sale' && contactId && (() => {
                  const pt = clientPT(); const lbl = pt === 'spec' ? 'специальная' : pt === 'opt' ? 'оптовая' : 'розничная'
                  const empty = rows.filter(r => r.productId && !(Number(r.price) > 0)).length
                  return <div data-price-type style={{ marginTop: 5, fontSize: 11.5, color: '#5f5952', lineHeight: 1.45 }}>цена продажи: <b>{lbl}</b>
                    {empty > 0 && <span style={{ color: '#c0532a', fontWeight: 700 }}> · {empty} поз. без цены — в номенклатуре нет цены «{lbl}», впишите в строке</span>}</div>
                })()}
              </div>
              <div>
                <label style={LBL}>ПРОЕКТ{contactId ? ' (клиента)' : ''}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select style={{ ...INP, flex: 1 }} value={specId} onChange={e => setSpecId(e.target.value)}><option value="">—</option>{specs.filter(p => !contactId || !p.clientId || p.clientId === contactId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <button onClick={newSpec} style={{ padding: '0 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#f1efec', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>＋</button>
                </div>
              </div>
              <div><label style={LBL}>ТЕЛЕФОН</label><input style={INP} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 700 000 00 00" /></div>
              {/* РАБОЧАЯ ДАТА: карточка оформляется этим днём (можно прошлым) — им же она ложится
                  в списки, журнал и номер. Вперёд нельзя (правило владельца 18.11.2026). */}
              <div>
                <label style={LBL} title="День, которым оформляется карточка — для правки прошлых дней">ДАТА ЗАКАЗА</label>
                <input style={{ ...INP, background: workDate !== todayYMD() ? '#fff0ea' : undefined, fontWeight: workDate !== todayYMD() ? 700 : 400 }}
                  type="date" max={todayYMD()} value={workDate} onChange={e => setWorkDate(e.target.value || todayYMD())} />
                {workDate !== todayYMD() && (
                  <div style={{ marginTop: 5, fontSize: 11.5, color: '#c0532a', lineHeight: 1.45 }}>
                    задним числом — накладные проведутся сразу этим днём, логисту отправлять не нужно
                    {kind === 'purchase' ? ' (приход, а по строкам с получателем — и расход)' : ''}
                  </div>
                )}
              </div>

            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em' }}>{kind === 'sale' ? 'ШАГ 2–3 — ТОВАРЫ И КОЛ-ВО · ШАГ 4 — ПОСТАВЩИК' : 'ПОЗИЦИИ'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', background: '#f8f6f3', borderRadius: 8, padding: '5px 8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>КО ВСЕМ:</span>
                {/* КО ВСЕМ. В ПРОДАЖЕ ПОСТАВЩИК НУЖНЕЕ ЛОГИСТА (просьба владельца 21.11.2026):
                    логист у строк и так один по умолчанию, а поставщика («производителя») ставят
                    каждой строке руками. В закупе шапка прежняя — и логист, и поставщик. */}
                {kind === 'purchase' && <select style={{ ...inpSm, width: 150 }} value="" onChange={e => assignAllLogist(e.target.value)}><option value="">Логист →</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
                <div style={{ width: 170 }}><ContragentPicker contragents={allCags} value="" defaultId={kind === 'purchase' ? defaultCagId : ''} onPick={c => c?.id && assignAllSupplier(c.id)} placeholder="Поставщик → всем" /></div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                {/* У закупа один поставщик, а получатели у строк разные — отдельная колонка. */}
                <thead><tr style={{ background: '#f1efec' }}>{['НАИМЕНОВАНИЕ', 'СМ', 'КОЛ-ВО', 'ЕД.', 'ЗАКУП ₸', 'ПРОДАЖА ₸', 'ЛОГИСТ', 'ПОСТАВЩИК', ...(kind === 'purchase' ? ['ПОЛУЧАТЕЛЬ'] : []), 'СРОК', 'ОПЛАТА', ''].map(h => <th key={h} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => { const rt = !!(r.transit || transit); return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1efec', background: rt ? '#faf7ff' : undefined }}>
                      <td style={{ padding: '6px 4px', minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {kind === 'sale' && <label title="Сквозная строка — мимо склада (drop-ship): только деньги/долги" style={{ cursor: transit ? 'default' : 'pointer', flexShrink: 0, opacity: transit ? 0.5 : 1 }}><input type="checkbox" checked={rt} disabled={transit} onChange={e => setRow(i, { transit: e.target.checked })} /></label>}
                          <div style={{ flex: 1 }}><NomInline products={products} value={r.productId} name={r.name1c} onPick={p => pickProduct(i, p)} /></div>
                        </div>
                      </td>
                      <td style={{ padding: '6px 4px', width: 64 }}><input style={inpSm} type="number" placeholder="см" value={r.widthCm} onChange={e => { const cm = e.target.value; setRow(i, { widthCm: cm, name1c: isIzdelie(r.name1c) ? itemName({ name: r.name1c, color: extractRal(r.name1c), cm }) : r.name1c }) }} /></td>
                      <td style={{ padding: '6px 4px', width: 70 }}><input data-qty style={inpSm} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 56 }}><input style={inpSm} value={r.unit} onChange={e => setRow(i, { unit: e.target.value })} /></td>
                      {/* ЗАКУП: price — цена закупа (уйдёт в приходную). ПРОДАЖА: цена для получателя
                          строки (уйдёт в расходную), подставляется из прайса по его типу цены. */}
                      {/* ЗАКАЗ — тоже две колонки (правило владельца 27.11.2026): ЗАКУП (costPrice, из карточки товара;
                          в приходную поставщику идёт, когда в строке выбран поставщик или строка сквозная) и
                          ПРОДАЖА (price, по типу цены заказчика — розн/опт/спец; уйдёт в расходную заказчику). */}
                      {kind === 'sale' && (
                        <td style={{ padding: '6px 4px', width: 100 }}>
                          <input style={{ ...inpSm, textAlign: 'right', color: '#7a3aaa', opacity: (rt || r.supplierId) ? 1 : 0.75 }} type="number" value={r.costPrice || ''} onChange={e => setRow(i, { costPrice: e.target.value })} placeholder="закуп"
                            title={(rt || r.supplierId) ? 'цена ЗАКУПА поставщику — по ней пойдёт приходная (пусто → закуп из карточки товара)' : 'цена ЗАКУПА из карточки товара — уйдёт в приходную, когда в строке выберете поставщика'} />
                        </td>
                      )}
                      <td style={{ padding: '6px 4px', width: 100 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input style={{ ...inpSm, textAlign: 'right', fontWeight: 600, ...(kind === 'sale' ? { color: '#2e8a5e' } : {}) }} type="number" value={r.price} onChange={e => setRow(i, { price: e.target.value })}
                            placeholder={kind === 'purchase' ? 'закуп' : (isIzdelie(r.name1c) ? 'за см' : 'прод.')}
                            title={kind === 'purchase' ? 'цена ЗАКУПА — по ней проводится приходная' : (isIzdelie(r.name1c) ? 'цена за 1 см (сумма = кол-во × см × цена)' : 'продажная цена (заказчику)')} />
                          {kind === 'purchase' && rt && <input style={{ ...inpSm, textAlign: 'right', color: '#7a3aaa' }} type="number" value={r.costPrice || ''} onChange={e => setRow(i, { costPrice: e.target.value })} placeholder="закуп" title="закупочная цена (поставщику) сквозной строки — без склада. Пусто → закуп из карточки товара" />}
                        </div>
                        {isIzdelie(r.name1c) && <div style={{ fontSize: 9.5, color: '#7a3aaa', textAlign: 'right', marginTop: 1 }}>за см</div>}
                      </td>
                      {kind === 'purchase' && (
                        <td style={{ padding: '6px 4px', width: 100 }}>
                          <input style={{ ...inpSm, textAlign: 'right', fontWeight: 600, color: '#2e8a5e' }} type="number" value={r.salePrice || ''} onChange={e => setRow(i, { salePrice: e.target.value })}
                            placeholder="прод." title="цена ПРОДАЖИ получателю — по ней пойдёт расходная; подставляется из прайса по типу цены получателя" />
                        </td>
                      )}
                      <td style={{ padding: '6px 4px', width: 130 }}><select style={inpSm} value={r.respUserId} onChange={e => setRow(i, { respUserId: e.target.value })}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
                      <td style={{ padding: '6px 4px', width: 150 }}><ContragentPicker contragents={allCags} value={r.supplierId} defaultId={kind === 'purchase' ? defaultCagId : ''} onPick={c => setRow(i, { supplierId: c.id })} placeholder={kind === 'purchase' ? '— поставщик —' : '— производитель —'} style={{ fontSize: 13 }} /></td>
                      {/* КОМУ ЭТА ПОЗИЦИЯ: закуп один, получатели у строк разные. Пусто → как раньше
                          (заказчик карточки / заявки автозакупа / склад). */}
                      {kind === 'purchase' && (
                        <td style={{ padding: '6px 4px', width: 150 }}>
                          <ContragentPicker contragents={allCags} value={r.recipientId} onPick={c => pickRowRecipient(i, c.id)} placeholder="— получатель —" style={{ fontSize: 13 }} />
                        </td>
                      )}
                      <td style={{ padding: '6px 4px', width: 120 }}><input style={inpSm} type="date" value={r.deadline} onChange={e => setRow(i, { deadline: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 120 }}><select style={inpSm} value={r.payment} onChange={e => setRow(i, { payment: e.target.value })}>{PAY.map(p => <option key={p} value={p}>{p || '—'}</option>)}</select></td>
                      <td style={{ padding: '6px 4px', width: 60 }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button onClick={() => setRows(rs => { const arr = [...rs]; arr.splice(i + 1, 0, { ...rs[i] }); return arr })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f5952', fontSize: 15 }} title="Клонировать">📋</button>
                          <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b03020', fontSize: 15 }} title="Удалить">🗑</button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setRows(rs => [...rs, emptyPos()])} style={{ border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '6px 16px', background: 'none', cursor: 'pointer', fontSize: 13, color: '#5f5952', fontFamily: 'inherit' }}>＋ Добавить позицию</button>
              <button onClick={() => setShowCatalog(true)} style={{ border: 'none', borderRadius: 7, padding: '6px 16px', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>📖 Каталог</button>
              <button onClick={pullPrices} style={{ border: '1.5px solid #e6c9b8', borderRadius: 7, padding: '6px 16px', background: '#fff8f5', color: '#c0532a', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>💰 Подтянуть цены</button>
            </div>
            {showCatalog && <StoreCatalog orgId={orgId} onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}

            {/* Срок и комментарий — ПОСЛЕ позиций, рядом с кнопками. */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', paddingTop: 12, marginTop: 12, borderTop: '1px solid #f1efec', flexWrap: 'wrap' }}>
              <div style={{ width: 150 }}><label style={LBL}>СРОК</label><input style={INP} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
              <div style={{ flex: 1, minWidth: 260 }}><label style={LBL}>КОММЕНТАРИЙ</label><textarea style={{ ...INP, minHeight: 44, resize: 'vertical' }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Дополнительные пожелания..." /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 12, marginTop: 12, borderTop: '1px solid #f1efec', flexWrap: 'wrap' }}>
              <Btn onClick={() => submit(true)} disabled={busy}>Сохранить черновик</Btn>
              <Btn variant={kind === 'purchase' || back ? 'primary' : undefined} onClick={() => submit(false)} disabled={busy || (kind === 'sale' && !contactId)}>{back ? '✅ ПРОВЕСТИ ЗАДНИМ ЧИСЛОМ (приход + расход)' : kind === 'purchase' ? 'ОТПРАВИТЬ ЗАКУП →' : 'ОТПРАВИТЬ ЗАКАЗ →'}</Btn>
              {kind === 'sale' && (
                <Btn variant="primary" onClick={() => submit(false, true)} disabled={busy || !contactId}>📦 Сделать закуп → логисту</Btn>
              )}
              <Btn variant="ghost" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', color: '#5f5952' }}>Отмена</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Автозакуп */}
      <AutoProcure orgId={orgId} onReload={onReload} toast={toast} />

      {/* Черновик закупа (накопитель) */}
      {purchaseDrafts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {purchaseDrafts.map(d => <PurchaseDraft key={d.id} draft={d} logists={logists} contragents={allCags} defaultCagId={defaultCagId} onAction={onAction} onReload={onReload} />)}
        </div>
      )}

      {/* Стол приёмки */}
      {processing.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Стол приёмки <span style={{ fontSize: 13, background: '#fdf8e1', color: '#8a6f00', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{processing.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {processing.map(o => <ProcessingCard key={o.id} order={o} contragents={allCags} defaultCagId={defaultCagId} logists={logists} products={products} onAction={onAction} onReload={onReload} toast={toast} />)}
          </div>
        </div>
      )}

      {/* Ожидание */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Ожидание <span style={{ fontSize: 13, background: '#fff0ea', color: '#c0532a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{waiting.length}</span></div>
        {waiting.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14, padding: '16px 0' }}>Нет карточек в ожидании</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
              {waiting.map(o => {
                // Заявка, под которую автозакуп уже оформил закуп, ждёт ПРИХОДА и уйдёт логисту
                // сама (releaseSalesOfPostedPurchase). Чтобы её не приняли руками — бейдж и
                // предупреждение на кнопке; номер закупа виден в журнале карточки.
                const waitBuy = o.status === 'Ждёт закупа'
                return (
                <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: `0 0 0 1.5px ${waitBuy ? '#f4d79a' : '#e6e2dc'}` }}>
                  <div onClick={() => onOpen?.(o)} title={onOpen ? 'Открыть состав заявки' : ''} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: COLORS.primary }}>{o.id}</span>
                      {o.source && <span style={sourceStyle(o.source)}>{sourceLabel(o.source)}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952', whiteSpace: 'nowrap' }}>{fmtDate(o.createdAt)} · <b style={{ color: COLORS.text }}>{fmtTime(o.createdAt)}</b></span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{o.fromName} → {o.toName || '—'}</div>
                    {waitBuy && <div style={{ fontSize: 12.5, background: '#fff7e6', color: '#8a5a00', border: '1px solid #f4d79a', borderRadius: 8, padding: '6px 9px', marginBottom: 10, fontWeight: 600 }}>⏳ Ждёт закупа — уйдёт логисту сама, когда проведёшь приходную по закупу</div>}
                    {o.comment && <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{o.comment}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant={waitBuy ? undefined : 'primary'} style={{ flex: 1 }}
                      onClick={() => { if (waitBuy && !confirm('Закуп по этой заявке ещё не пришёл. Она уйдёт логисту сама после приходной.\n\nВсё равно взять её в обработку вручную?')) return
                        onAction(o.id, 'take') }}>ПРИНЯТЬ В ОБРАБОТКУ →</Btn>
                    <Btn onClick={() => onAction(o.id, 'returnToIncoming')}>← Вернуть</Btn>
                  </div>
                </div>
              )})}
            </div>}
      </div>

      {/* Черновики */}
      {saleDrafts.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Черновики <span style={{ fontSize: 13, background: '#efece8', color: '#6b655b', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{saleDrafts.length}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {saleDrafts.map(o => (
              <div key={o.id} style={{ background: '#faf8f6', borderRadius: 12, padding: 16, border: '1.5px dashed #d8d3cc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: '#5f5952' }}>{o.id}</span>
                  <span style={statusStyle('Черновик')}>Черновик</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952' }}>{fmtDate(o.createdAt)}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{o.fromName}</div>
                {o.comment && <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 10 }}>{o.comment.slice(0, 60)}...</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={() => onOpen?.(o)}>Доработать</Btn>
                  <Btn variant="primary" onClick={() => onAction(o.id, 'accept')}>Отправить</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
