'use client'
// Кабинет филиала-МАГАЗИНА (kind='seller', напр. «Магазин Кристалл») — рабочее место кассира
// с телефона. Производства здесь нет: каталог открыт СРАЗУ (без кнопки), рабочие папки
// продавца вкладками — Водосток / Евро брус / Комплектующие / Металлочерепица, под ними цвет
// RAL, дальше товары папки строками: тап «+» кладёт в чек. Чек — шторка снизу: строки, итог и
// оплата в один тап (Нал / Каспи / В долг), развёрнутая оплата (QR, сдача, смешанная) — по «⋯».
// Чек = карточка-продажа в книге филиала + расходная (склад филиала −) + оплаты, всё это
// делает `cashier.service.sellDirect`.
import { useState, useEffect, useCallback, useMemo } from 'react'
import NomPicker, { type PickedPos } from '@/components/NomPicker'
import ContragentPicker from '@/components/ContragentPicker'
import FinanceView from '@/components/portals/FinanceView'
import ShiftView from '@/components/portals/ShiftView'
import DocsView from '@/components/portals/DocsView'
import { lineAmount, isIzdelie } from '@/lib/lineAmount'
import { itemName } from '@/lib/itemName'
import { extractRal, ralOrdered } from '@/lib/ral'
import { branchOrders, sellCheck, unpostSale } from '@/lib/api/orders'
import { fetchRefs, stock as fetchStock } from '@/lib/api/refs'
import { logout } from '@/lib/api/auth'
import { useLiveData } from '@/lib/live'
import PushSetup from '@/components/PushSetup'

const PRIMARY = '#d4613a', BG = '#f1efec', DARK = '#26231f', GREEN = '#2e8a5e'
type Tab = 'cash' | 'checks' | 'stock' | 'shift' | 'docs' | 'finance'

const money = (n: number) => Math.round(n).toLocaleString('ru-RU')
const num = (s: string) => Number((s || '').replace(',', '.')) || 0
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

// Рабочие папки продавца — реальные категории базы (Водосток 87, Евро брус 72,
// Комплектующие 35, Металлочерепица 48). «Комплектующие» — базы «Без цвета»:
// конкретный товар собирается как цвет + см (та же формула, что у мастера — lib/itemName).
const FOLDERS = [
  { key: 'vodostok', label: 'Водосток', match: (p: any) => norm(p.group) === 'водосток' },
  { key: 'evrobrus', label: 'Евро брус', match: (p: any) => norm(p.cat) === 'евро брус' },
  { key: 'kompl', label: 'Комплект.', match: (p: any) => norm(p.cat).includes('комплект'), build: true },
  { key: 'cherep', label: 'Металлоч.', match: (p: any) => norm(p.cat) === 'металлочерепица' },
]

interface Row { key: string; name1c: string; oral: string; qty: number; unit: string; price: number; widthCm?: number; productId?: string }

export default function SellerPortal({ user, orgName }: { user: { id: string; name: string; orgId: string; slug?: string }; orgName?: string }) {
  const [tab, setTab] = useState<Tab>('cash')
  const [toast, setToast] = useState('')
  const [cags, setCags] = useState<any[]>([]); const [products, setProducts] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [rows, setRows] = useState<Row[]>([]); const [showCatalog, setShowCatalog] = useState(false)
  const [contactId, setContactId] = useState(''); const [showClient, setShowClient] = useState(false)
  const [pay, setPay] = useState({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' })
  const [payOpen, setPayOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<any[]>([])
  const [stockRows, setStockRows] = useState<any[]>([])
  // каталог на экране
  const [folder, setFolder] = useState(FOLDERS[0].key)
  const [color, setColor] = useState('')
  const [allColors, setAllColors] = useState(false)
  const [q, setQ] = useState('')
  const [build, setBuild] = useState<any>(null)   // сборка комплектующего: база + цвет + см
  // Продавец за кассой: выбирается на своём телефоне и держится (localStorage), пока не сменят.
  const [staff, setStaff] = useState<any[]>([])
  const [seller, setSeller] = useState<{ id: string; name: string } | null>(null)
  const [pickSeller, setPickSeller] = useState(false)
  const [sellerReady, setSellerReady] = useState(false)

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    fetchRefs().then((r: any) => {
      setCags((r.contragents || []).filter((c: any) => !c.archived))
      setProducts(r.products || [])
      setWarehouses((r.warehouses || []).filter((w: any) => w.orgId === user.orgId))
    })
  }, [user.orgId])

  const SELLER_KEY = `u2b_seller_${user.orgId}`
  useEffect(() => {
    fetch(`/api/employees?orgId=${user.orgId}`).then(r => r.ok ? r.json() : []).then((d: any[]) => setStaff(Array.isArray(d) ? d : []))
    try {
      const raw = localStorage.getItem(SELLER_KEY)
      if (raw) setSeller(JSON.parse(raw))
    } catch {}
    setSellerReady(true)
  }, [user.orgId, SELLER_KEY])

  function chooseSeller(s: { id: string; name: string } | null) {
    setSeller(s); setPickSeller(false)
    try { s ? localStorage.setItem(SELLER_KEY, JSON.stringify(s)) : localStorage.removeItem(SELLER_KEY) } catch {}
  }

  const load = useCallback(async () => { setChecks(await branchOrders(user.id)) }, [user.id])
  useEffect(() => { load() }, [load])
  useLiveData(() => { if (!showCatalog && !busy) load() }, [])

  // Остатки своего склада (центральный склад филиала).
  useEffect(() => {
    if (tab !== 'stock' || !warehouses.length) return
    const wh = warehouses.find((w: any) => w.isCentral) || warehouses[0]
    fetchStock(user.orgId, wh.id).then(setStockRows)
  }, [tab, warehouses, user.orgId])

  const byName = useMemo(() => {
    const m: Record<string, any> = {}
    for (const p of products) m[norm(p.name)] = p
    return m
  }, [products])

  // Цена из каталога под тип клиента (для изделий — цена ЗА СМ). Продавец может её править.
  const pullPrices = useCallback(async (items: Row[], client: string) => {
    const names = items.map(r => r.name1c).filter(Boolean)
    if (!names.length) return items
    const p = new URLSearchParams({ names: names.join('|') })
    if (client) p.set('contragentId', client)
    const ids = items.map(r => r.productId).filter(Boolean) as string[]
    if (ids.length) p.set('productIds', ids.join(','))
    const map: Record<string, number> = await fetch(`/api/pricing?${p}`).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    return items.map(r => {
      const v = (r.productId && map[r.productId]) || map[r.name1c] || 0
      return v > 0 && !r.price ? { ...r, price: v } : r
    })
  }, [])

  // Товары открытой папки: фильтр по цвету (RAL из имени) и поиску.
  const activeFolder = FOLDERS.find(f => f.key === folder) || FOLDERS[0]
  const list = useMemo(() => {
    let base = products.filter(activeFolder.match)
    if (activeFolder.build) {
      // Комплектующие: показываем только базы «Без цвета» — цвет и см добавляются при выборе.
      base = base.filter(p => !extractRal(p.name))
    } else if (color) {
      base = base.filter(p => extractRal(p.name) === color)
    }
    const s = norm(q)
    if (s) base = base.filter(p => norm(p.name).includes(s))
    return base.slice(0, 150)
  }, [products, activeFolder, color, q])

  const inCheck = useMemo(() => {
    const m: Record<string, Row> = {}
    for (const r of rows) if (r.productId) m[r.productId] = r
    return m
  }, [rows])

  async function addRow(fresh: Row) {
    const [priced] = await pullPrices([fresh], contactId)
    setRows(rs => [...rs, priced])
  }

  function tapProduct(p: any) {
    // Комплектующее (база «Без цвета») — собираем: цвет сверху + см, если это «Изделие».
    if (activeFolder.build) {
      if (!color) { showMsg('⚠ Сначала выберите цвет'); return }
      setBuild({ base: p, cm: '', qty: '1' })
      return
    }
    const exist = rows.find(r => r.productId === p.id)
    if (exist) { patchRow(exist.key, { qty: exist.qty + 1 }); return }
    addRow({ key: `${Date.now()}-${p.id}`, name1c: p.name, oral: p.name, qty: 1, unit: p.unit || 'шт', price: 0, productId: p.id })
  }

  function addBuilt() {
    const b = build; if (!b) return
    const name = itemName({ name: b.base.name, color, cm: b.cm })
    const prod = byName[norm(name)]
    const qty = Math.max(1, num(b.qty) || 1)
    const widthCm = num(b.cm) || undefined
    setBuild(null)
    addRow({ key: `${Date.now()}-b`, name1c: name, oral: name, qty, unit: b.base.unit || 'шт', price: 0, widthCm, productId: prod?.id })
  }

  async function addFromCatalog(picked: PickedPos[]) {
    setShowCatalog(false)
    const fresh: Row[] = picked.map((p, i) => ({ ...p, key: `${Date.now()}-${i}`, price: 0, productId: byName[norm(p.name1c)]?.id }))
    const priced = await pullPrices(fresh, contactId)
    setRows(rs => [...rs, ...priced])
  }

  const total = rows.reduce((s, r) => s + lineAmount({ name: r.name1c, qty: r.qty, price: r.price, widthCm: r.widthCm }), 0)
  const cashN = num(pay.cash), kaspiN = num(pay.kaspi), qrN = num(pay.qr)
  const debtN = Math.max(0, total - cashN - kaspiN - qrN)
  const client = cags.find(c => c.id === contactId)
  const noPrice = rows.some(r => !r.price)

  function patchRow(key: string, patch: Partial<Row>) { setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r)) }

  // Быстрая оплата в один тап: вся сумма выбранным способом (или в долг).
  async function quickPay(how: 'cash' | 'kaspi' | 'debt') {
    if (!rows.length) return
    if (noPrice) { showMsg('⚠ Есть позиции без цены — впишите цену в чеке'); return }
    await doSell({
      cash: how === 'cash' ? total : 0,
      kaspi: how === 'kaspi' ? total : 0,
      qr: 0, change: 0, changeFrom: '',
    })
  }

  async function doSell(p?: { cash: number; kaspi: number; qr: number; change: number; changeFrom: string }) {
    if (!rows.length) { showMsg('⚠ Чек пустой'); return }
    if (noPrice) { showMsg('⚠ Есть позиции без цены'); return }
    const body = p || { cash: cashN, kaspi: kaspiN, qr: qrN, change: num(pay.change), changeFrom: pay.changeFrom }
    setBusy(true)
    const r = await sellCheck({
      uid: user.id, contactId: contactId || undefined,
      sellerId: seller?.id, seller: seller?.name,
      ...body,
      positions: rows.map(x => ({ productId: x.productId, name1c: x.name1c, oral: x.oral, qty: x.qty, unit: x.unit, price: x.price, widthCm: x.widthCm })),
    })
    setBusy(false)
    if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось пробить чек')); return }
    setRows([]); setPay({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' }); setContactId(''); setPayOpen(false)
    await load()
    showMsg(`💵 Чек пробит${r.number ? ` (${r.number})` : ''} · ${money(r.total || total)} ₸${r.debt ? ` · долг ${money(r.debt)}` : ''}`)
  }

  async function doUnpay(id: string) {
    const r = await unpostSale(id)
    if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось')); return }
    await load(); showMsg('↩ Продажа отменена')
  }

  const sold = checks.filter((o: any) => o.prodPhase === 'sold' || o.linkedDocId)
  const soldToday = sold.filter((o: any) => {
    const d = o.delivered || o.createdAt
    return d && new Date(d).toDateString() === new Date().toDateString()
  })
  const todaySum = soldToday.reduce((s: number, o: any) => s + Number(o.total || 0), 0)

  const inp = { padding: '9px 10px', borderRadius: 9, border: '1.5px solid #e6e2dc', fontSize: 15, fontWeight: 700, textAlign: 'right' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const, width: '100%' }
  const checkH = rows.length ? (payOpen ? 330 : 214) : 0

  // Экран выбора продавца: показывается при первом заходе с этого телефона и по кнопке «сменить».
  if (sellerReady && (!seller || pickSeller)) {
    return (
      <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Golos Text', system-ui, sans-serif" }}>
        <div style={{ background: DARK, color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏪</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Кто за кассой?</div>
            <div style={{ fontSize: 12, color: '#b8b1a6' }}>{orgName || user.name}</div>
          </div>
          {seller && <button onClick={() => setPickSeller(false)} style={{ background: '#3a3630', border: 'none', color: '#d8d2c8', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Отмена</button>}
        </div>
        <div style={{ padding: 16, maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {staff.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc', color: '#8a8377' }}>
              Продавцы ещё не заведены — добавьте сотрудников филиала в админке (Сотрудники).
            </div>
          )}
          {staff.map((e: any) => {
            const on = seller?.id === e.id
            return (
              <button key={e.id} onClick={() => chooseSeller({ id: e.id, name: e.name })} style={{ border: on ? 'none' : '1.5px solid #e6e2dc', background: on ? PRIMARY : '#fff', color: on ? '#fff' : DARK, borderRadius: 14, padding: '20px 18px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 19, fontWeight: 800, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>👤</span>
                <span style={{ flex: 1 }}>{e.name}</span>
                {e.position && <span style={{ fontSize: 12.5, fontWeight: 600, color: on ? '#ffe8de' : '#8a8377' }}>{e.position}</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {/* шапка */}
      <div style={{ background: DARK, color: '#fff', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 60 }}>
        <span style={{ fontSize: 20 }}>🏪</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>Касса магазина</div>
          <button onClick={() => setPickSeller(true)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#f0c8b6', fontWeight: 700 }}>👤 {seller?.name || 'продавец не выбран'}</span>
            <span style={{ color: '#b8b1a6', textDecoration: 'underline' }}>сменить</span>
          </button>
        </div>
        <div style={{ textAlign: 'right', marginRight: 6 }}>
          <div style={{ fontSize: 10.5, color: '#b8b1a6' }}>сегодня</div>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>{money(todaySum)} ₸</div>
        </div>
        <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: '#3a3630', border: 'none', color: '#d8d2c8', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Выйти</button>
      </div>

      {toast && <div style={{ position: 'fixed', top: 66, left: '50%', transform: 'translateX(-50%)', background: DARK, color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13.5, zIndex: 300, maxWidth: '92vw' }}>{toast}</div>}

      {tab === 'cash' ? (
        <div style={{ paddingBottom: 74 + checkH }}>
          {/* папки продавца — вкладками */}
          <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e6e2dc', position: 'sticky', top: 56, zIndex: 50 }}>
            {FOLDERS.map(f => {
              const on = folder === f.key
              return (
                <button key={f.key} onClick={() => { setFolder(f.key); setBuild(null) }} style={{ flex: 1, border: 'none', background: 'none', padding: '11px 2px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? PRIMARY : '#6b645b', borderBottom: `3px solid ${on ? PRIMARY : 'transparent'}` }}>{f.label}</button>
              )
            })}
            <button onClick={() => setShowCatalog(true)} title="Весь каталог" style={{ width: 44, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 17, color: '#6b645b', borderBottom: '3px solid transparent' }}>⋯</button>
          </div>

          {/* цвет */}
          <div style={{ background: '#fff', padding: '9px 10px 10px', borderBottom: '1px solid #e6e2dc', display: 'flex', gap: 9, overflowX: 'auto' }}>
            {ralOrdered(allColors).map(c => {
              const on = color === c.code
              return (
                <button key={c.code} onClick={() => setColor(on ? '' : c.code)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 13, background: c.hex || c.bg, boxShadow: on ? `0 0 0 3px ${PRIMARY}, inset 0 0 0 1px #ddd8d0` : '0 0 0 1px #ddd8d0' }} />
                  <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? DARK : '#6b645b' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
                </button>
              )
            })}
            <button onClick={() => setAllColors(v => !v)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ width: 46, height: 46, borderRadius: 13, background: '#f7f5f2', boxShadow: '0 0 0 1px #ddd8d0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>👁</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#8a8377' }}>{allColors ? 'меньше' : 'ещё'}</span>
            </button>
          </div>

          {/* поиск + счётчик */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px 6px' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 поиск по названию" style={{ flex: 1, padding: '9px 11px', borderRadius: 10, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <span style={{ fontSize: 11.5, color: '#a09889', whiteSpace: 'nowrap' }}>{list.length} поз.</span>
          </div>

          {/* сборка комплектующего: цвет уже выбран сверху, тут см и количество */}
          {build && (
            <div style={{ margin: '0 12px 8px', background: '#fff', borderRadius: 12, padding: 12, boxShadow: `0 0 0 2px ${PRIMARY}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{itemName({ name: build.base.name, color, cm: build.cm })}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Размер, см<input value={build.cm} inputMode="decimal" autoFocus onChange={e => setBuild((b: any) => ({ ...b, cm: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder={isIzdelie(build.base.name) ? 'обязательно' : 'если нужен'} style={{ ...inp, marginTop: 3 }} /></label>
                <label style={{ width: 90, fontSize: 11, color: '#5f5952' }}>Кол-во<input value={build.qty} inputMode="decimal" onChange={e => setBuild((b: any) => ({ ...b, qty: e.target.value.replace(/[^0-9.,]/g, '') }))} style={{ ...inp, marginTop: 3 }} /></label>
                <button onClick={addBuilt} style={{ border: 'none', background: PRIMARY, color: '#fff', borderRadius: 10, padding: '11px 16px', cursor: 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'inherit' }}>В чек</button>
                <button onClick={() => setBuild(null)} style={{ border: '1.5px solid #e6e2dc', background: '#fff', color: '#6b645b', borderRadius: 10, padding: '11px 12px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>✕</button>
              </div>
            </div>
          )}

          {/* товары папки */}
          <div style={{ margin: '0 12px', background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1px #e6e2dc', overflow: 'hidden' }}>
            {list.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#8a8377', fontSize: 13.5 }}>{color ? 'В этом цвете ничего нет — снимите цвет или выберите другой' : 'Ничего не найдено'}</div>}
            {list.map(p => {
              const row = inCheck[p.id]
              const price = Number(p.priceRetail) || 0
              return (
                <div key={p.id} onClick={() => !row && tapProduct(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f4f1ed', background: row ? '#fdf6f2' : '#fff', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: DARK, lineHeight: 1.25 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: '#a09889' }}>{price > 0 ? `${money(price)} ₸/${p.unit || 'шт'}` : 'цена — впишите в чеке'}</div>
                  </div>
                  {row ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <button onClick={e => { e.stopPropagation(); row.qty <= 1 ? setRows(rs => rs.filter(x => x.key !== row.key)) : patchRow(row.key, { qty: row.qty - 1 }) }} style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 17, cursor: 'pointer', color: '#6b645b' }}>−</button>
                      <span style={{ fontSize: 15, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{row.qty}</span>
                      <button onClick={e => { e.stopPropagation(); patchRow(row.key, { qty: row.qty + 1 }) }} style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: PRIMARY, color: '#fff', fontSize: 19, fontWeight: 700, cursor: 'pointer' }}>+</button>
                    </div>
                  ) : (
                    <span style={{ width: 40, height: 40, borderRadius: 11, background: PRIMARY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, flexShrink: 0 }}>+</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ padding: 12, maxWidth: 760, margin: '0 auto', paddingBottom: 86 }}>
          {tab === 'checks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sold.length === 0 && <div style={{ background: '#fff', borderRadius: 12, padding: 30, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc', color: '#8a8377' }}>Продаж пока нет</div>}
              {sold.map((o: any) => (
                <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 0 0 1px #e6e2dc', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: GREEN }}>{o.id}</div>
                    <div style={{ fontSize: 12.5, color: '#5f5952', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.seller ? `👤 ${o.seller} · ` : ''}{o.contactName || o.fromName || 'Розница'} · {o.payment || '—'}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{money(Number(o.total || 0))} ₸</div>
                  <button onClick={() => doUnpay(o.id)} style={{ border: '1.5px solid #e6c9b8', background: '#fff', color: '#c0532a', borderRadius: 9, padding: '8px 10px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>↩</button>
                </div>
              ))}
            </div>
          )}

          {tab === 'stock' && (
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1px #e6e2dc', overflow: 'hidden' }}>
              {stockRows.filter((s: any) => Number(s.qty) !== 0).length === 0
                ? <div style={{ padding: 30, textAlign: 'center', color: '#8a8377' }}>Склад пуст</div>
                : stockRows.filter((s: any) => Number(s.qty) !== 0).map((s: any) => {
                  const p = products.find(x => x.id === s.productId)
                  return (
                    <div key={s.productId} style={{ padding: '10px 12px', borderBottom: '1px solid #f4f1ed', display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ flex: 1, fontSize: 14 }}>{p?.name || s.productId}</div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: Number(s.qty) < 0 ? '#c0532a' : DARK }}>{Number(s.qty).toLocaleString('ru-RU')} {p?.unit || 'шт'}</div>
                    </div>
                  )
                })}
            </div>
          )}

          {tab === 'shift' && <ShiftView uid={user.id} />}
          {tab === 'docs' && <DocsView orgId={user.orgId} />}
          {tab === 'finance' && <FinanceView />}
        </div>
      )}

      {/* ЧЕК — шторка снизу: строки, итог, оплата в один тап */}
      {tab === 'cash' && rows.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 62, background: '#fff', borderRadius: '16px 16px 0 0', boxShadow: '0 -6px 20px rgba(38,35,31,.16)', zIndex: 90, maxWidth: 760, margin: '0 auto' }}>
          <div style={{ padding: '8px 14px 0' }}>
            <div style={{ width: 36, height: 4, borderRadius: 3, background: '#e0dbd3', margin: '0 auto' }} />
          </div>
          <div style={{ padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* покупатель */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setShowClient(v => !v)} style={{ border: '1.5px solid #e6e2dc', background: '#fff', borderRadius: 9, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: '#4a443c', maxWidth: '62%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {client ? client.name : 'Розница'}</button>
              {contactId && <button onClick={() => setContactId('')} style={{ border: 'none', background: '#f7f5f2', color: '#8a8377', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>сброс</button>}
              <button onClick={() => setRows([])} style={{ marginLeft: 'auto', border: 'none', background: '#f7f5f2', color: '#c0532a', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>очистить</button>
            </div>
            {showClient && <ContragentPicker contragents={cags} value={contactId} onPick={(c: any) => { setContactId(c?.id || ''); setShowClient(false) }} placeholder="— найти покупателя —" />}

            {/* строки чека */}
            <div style={{ maxHeight: payOpen ? 96 : 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map(r => {
                const perCm = isIzdelie(r.name1c)
                const sum = lineAmount({ name: r.name1c, qty: r.qty, price: r.price, widthCm: r.widthCm })
                return (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#4a443c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name1c} · {r.qty}{r.widthCm ? `×${r.widthCm}см` : ''}</div>
                    <input value={r.price ? String(r.price) : ''} inputMode="decimal" placeholder={perCm ? '₸/см' : '₸'} onChange={e => patchRow(r.key, { price: num(e.target.value.replace(/[^0-9.,]/g, '')) })} style={{ ...inp, width: 78, padding: '6px 8px', fontSize: 13, border: r.price ? '1.5px solid #e6e2dc' : `1.5px solid ${PRIMARY}` }} />
                    <span style={{ fontSize: 13.5, fontWeight: 800, minWidth: 62, textAlign: 'right' }}>{money(sum)}</span>
                    <button onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} style={{ border: 'none', background: 'none', color: '#c0532a', cursor: 'pointer', fontSize: 13, padding: '2px 2px' }}>✕</button>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 5, borderTop: '1px solid #f1ede8' }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em' }}>ИТОГО</span>
              <span style={{ fontSize: 12, color: '#a09889' }}>{rows.length} поз.</span>
              <span style={{ marginLeft: 'auto', fontSize: 19, fontWeight: 800 }}>{money(total)} ₸</span>
            </div>

            {payOpen ? (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Наличка<input value={pay.cash} inputMode="decimal" onChange={e => setPay(p => ({ ...p, cash: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
                  <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Каспи<input value={pay.kaspi} inputMode="decimal" onChange={e => setPay(p => ({ ...p, kaspi: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
                  <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>QR<input value={pay.qr} inputMode="decimal" onChange={e => setPay(p => ({ ...p, qr: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: '#5f5952' }}>Сдача</span>
                  <input value={pay.change} inputMode="decimal" onChange={e => setPay(p => ({ ...p, change: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...inp, width: 78, fontSize: 13.5 }} />
                  <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: debtN > 0 ? '#c0532a' : GREEN }}>долг {money(debtN)} ₸</span>
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={() => setPayOpen(false)} style={{ border: '1.5px solid #e6e2dc', background: '#fff', color: '#6b645b', borderRadius: 11, padding: '13px 14px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>↑ Свернуть</button>
                  <button disabled={busy} onClick={() => doSell()} style={{ flex: 1, border: 'none', background: busy ? '#9bb5a6' : GREEN, color: '#fff', borderRadius: 11, padding: '13px 8px', cursor: busy ? 'default' : 'pointer', fontSize: 15.5, fontWeight: 800, fontFamily: 'inherit' }}>{busy ? '…' : `💵 Продать · ${money(total)} ₸`}</button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 7 }}>
                <button disabled={busy} onClick={() => quickPay('cash')} style={{ flex: 1, border: 'none', background: busy ? '#9bb5a6' : GREEN, color: '#fff', borderRadius: 11, padding: '13px 6px', cursor: 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'inherit' }}>💵 Нал</button>
                <button disabled={busy} onClick={() => quickPay('kaspi')} style={{ flex: 1, border: '1.5px solid #e6e2dc', background: '#fff', color: DARK, borderRadius: 11, padding: '13px 6px', cursor: 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'inherit' }}>Каспи</button>
                <button disabled={busy} onClick={() => quickPay('debt')} style={{ flex: 1, border: '1.5px solid #e6c9b8', background: '#fff8f5', color: '#c0532a', borderRadius: 11, padding: '13px 6px', cursor: 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'inherit' }}>В долг</button>
                <button onClick={() => setPayOpen(true)} title="QR, сдача, смешанная оплата" style={{ width: 46, border: '1.5px solid #e6e2dc', background: '#fff', color: '#6b645b', borderRadius: 11, cursor: 'pointer', fontSize: 17, fontFamily: 'inherit' }}>⋯</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* нижняя навигация */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #e6e2dc', display: 'flex', zIndex: 100 }}>
        {([
          { key: 'cash' as Tab, icon: '💵', label: 'Касса' },
          { key: 'checks' as Tab, icon: '🧾', label: 'Чеки' },
          { key: 'stock' as Tab, icon: '📦', label: 'Склад' },
          { key: 'shift' as Tab, icon: '📅', label: 'Смена' },
          { key: 'docs' as Tab, icon: '📄', label: 'Док-ты' },
          { key: 'finance' as Tab, icon: '💰', label: 'Финансы' },
        ]).map(({ key, icon, label }) => {
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, border: 'none', background: 'none', padding: '7px 2px 9px', cursor: 'pointer', fontFamily: 'inherit', color: active ? PRIMARY : '#8a8377' }}>
              <div style={{ fontSize: 18 }}>{icon}</div>
              <div style={{ fontSize: 10.5, fontWeight: active ? 800 : 600 }}>{label}</div>
            </button>
          )
        })}
      </div>

      {showCatalog && <NomPicker onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}
      <PushSetup />
    </div>
  )
}
