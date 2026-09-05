'use client'
// Кабинет филиала-МАГАЗИНА (kind='seller', напр. «Магазин Кристалл») — рабочее место кассира
// с телефона. Производства здесь нет: продавец жмёт «Каталог» (та же моделька, что в головном:
// цвет → размер → количество), набирает чек и пробивает его одной кнопкой.
// Чек = карточка-продажа в книге филиала + расходная (склад филиала −) + оплаты нал/каспи/QR,
// остаток суммы = долг покупателя. Всё это делает `cashier.service.sellDirect`.
import { useState, useEffect, useCallback, useMemo } from 'react'
import NomPicker, { type PickedPos } from '@/components/NomPicker'
import ContragentPicker from '@/components/ContragentPicker'
import FinanceView from '@/components/portals/FinanceView'
import ShiftView from '@/components/portals/ShiftView'
import DocsView from '@/components/portals/DocsView'
import { lineAmount, isIzdelie } from '@/lib/lineAmount'
import { branchOrders, sellCheck, unpostSale } from '@/lib/api/orders'
import { fetchRefs, stock as fetchStock } from '@/lib/api/refs'
import { logout } from '@/lib/api/auth'
import { useLiveData } from '@/lib/live'
import PushSetup from '@/components/PushSetup'

const PRIMARY = '#d4613a', BG = '#f1efec'
type Tab = 'cash' | 'checks' | 'stock' | 'shift' | 'docs' | 'finance'

const money = (n: number) => Math.round(n).toLocaleString('ru-RU')
const num = (s: string) => Number((s || '').replace(',', '.')) || 0
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

interface Row extends PickedPos { key: string; price: number; productId?: string }

export default function SellerPortal({ user, orgName }: { user: { id: string; name: string; orgId: string; slug?: string }; orgName?: string }) {
  const [tab, setTab] = useState<Tab>('cash')
  const [toast, setToast] = useState('')
  const [cags, setCags] = useState<any[]>([]); const [products, setProducts] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [rows, setRows] = useState<Row[]>([]); const [showCatalog, setShowCatalog] = useState(false)
  const [contactId, setContactId] = useState(''); const [showClient, setShowClient] = useState(false)
  const [pay, setPay] = useState({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' })
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<any[]>([])
  const [stockRows, setStockRows] = useState<any[]>([])
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
    const q = new URLSearchParams({ names: names.join('|') })
    if (client) q.set('contragentId', client)
    const ids = items.map(r => r.productId).filter(Boolean) as string[]
    if (ids.length) q.set('productIds', ids.join(','))
    const map: Record<string, number> = await fetch(`/api/pricing?${q}`).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    return items.map(r => {
      const v = (r.productId && map[r.productId]) || map[r.name1c] || 0
      return v > 0 && !r.price ? { ...r, price: v } : r
    })
  }, [])

  async function addFromCatalog(picked: PickedPos[]) {
    setShowCatalog(false)
    const fresh: Row[] = picked.map((p, i) => {
      const prod = byName[norm(p.name1c)]
      return { ...p, key: `${Date.now()}-${i}`, price: 0, productId: prod?.id }
    })
    setRows(await pullPrices(fresh, contactId).then(list => [...rows, ...list]))
  }

  const total = rows.reduce((s, r) => s + lineAmount({ name: r.name1c, qty: r.qty, price: r.price, widthCm: r.widthCm }), 0)
  const cashN = num(pay.cash), kaspiN = num(pay.kaspi), qrN = num(pay.qr)
  const debtN = Math.max(0, total - cashN - kaspiN - qrN)
  const client = cags.find(c => c.id === contactId)

  function patchRow(key: string, patch: Partial<Row>) { setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r)) }

  async function doSell() {
    if (!rows.length) { showMsg('⚠ Чек пустой'); return }
    if (rows.some(r => !r.price)) { showMsg('⚠ Есть позиции без цены'); return }
    setBusy(true)
    const r = await sellCheck({
      uid: user.id, contactId: contactId || undefined,
      sellerId: seller?.id, seller: seller?.name,
      cash: cashN, kaspi: kaspiN, qr: qrN, change: num(pay.change), changeFrom: pay.changeFrom,
      positions: rows.map(x => ({ productId: x.productId, name1c: x.name1c, oral: x.oral, qty: x.qty, unit: x.unit, price: x.price, widthCm: x.widthCm })),
    })
    setBusy(false)
    if (!r.ok) { showMsg('⚠ ' + (r.error || 'Не удалось пробить чек')); return }
    setRows([]); setPay({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' }); setContactId('')
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

  const input = { padding: '9px 10px', borderRadius: 9, border: '1.5px solid #e6e2dc', fontSize: 15, fontWeight: 700, textAlign: 'right' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const, width: '100%' }

  // Экран выбора продавца: показывается при первом заходе с этого телефона и по кнопке «сменить».
  // Выбор хранится локально на устройстве — продавец не перевыбирает его на каждый чек.
  if (sellerReady && (!seller || pickSeller)) {
    return (
      <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Golos Text', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#26231f', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏪</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Кто за кассой?</div>
            <div style={{ fontSize: 12, color: '#b8b1a6' }}>{orgName || user.name}</div>
          </div>
          {seller && <button onClick={() => setPickSeller(false)} style={{ background: '#3a3630', border: 'none', color: '#d8d2c8', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Отмена</button>}
        </div>
        <div style={{ padding: 16, maxWidth: 520, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box' }}>
          {staff.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc', color: '#8a8377' }}>
              Продавцы ещё не заведены — добавьте сотрудников филиала в админке (Настройки → Сотрудники).
            </div>
          )}
          {staff.map((e: any) => {
            const on = seller?.id === e.id
            return (
              <button key={e.id} onClick={() => chooseSeller({ id: e.id, name: e.name })} style={{ border: on ? 'none' : '1.5px solid #e6e2dc', background: on ? PRIMARY : '#fff', color: on ? '#fff' : '#26231f', borderRadius: 14, padding: '20px 18px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 19, fontWeight: 800, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
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
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Golos Text', system-ui, sans-serif", paddingBottom: 74 }}>
      <div style={{ background: '#26231f', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 50 }}>
        <span style={{ fontSize: 22 }}>🏪</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Касса магазина</div>
          <button onClick={() => setPickSeller(true)} title="Сменить продавца" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: '#b8b1a6', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#f0c8b6', fontWeight: 700 }}>👤 {seller?.name || 'продавец не выбран'}</span>
            <span style={{ textDecoration: 'underline' }}>сменить</span>
          </button>
        </div>
        <div style={{ textAlign: 'right', marginRight: 6 }}>
          <div style={{ fontSize: 11, color: '#b8b1a6' }}>сегодня</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{money(todaySum)} ₸</div>
        </div>
        <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: '#3a3630', border: 'none', color: '#d8d2c8', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Выйти</button>
      </div>

      {toast && <div style={{ position: 'fixed', top: 68, left: '50%', transform: 'translateX(-50%)', background: '#26231f', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13.5, zIndex: 300, maxWidth: '92vw' }}>{toast}</div>}

      <div style={{ padding: 12, maxWidth: 760, margin: '0 auto' }}>
        {tab === 'cash' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* покупатель: розница по умолчанию, выбор — по кнопке */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 10, boxShadow: '0 0 0 1px #e6e2dc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>👤</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#8a8377' }}>Покупатель</div>
                <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client ? client.name : 'Розничный покупатель'}</div>
              </div>
              {contactId
                ? <button onClick={() => setContactId('')} style={{ border: '1.5px solid #e6e2dc', background: '#fff', color: '#5f5952', borderRadius: 9, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Розница</button>
                : <button onClick={() => setShowClient(true)} style={{ border: '1.5px solid #e6e2dc', background: '#fff', color: '#5f5952', borderRadius: 9, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Выбрать</button>}
            </div>
            {showClient && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 10, boxShadow: '0 0 0 1px #e6e2dc' }}>
                <ContragentPicker contragents={cags} value={contactId} onPick={(c: any) => { setContactId(c?.id || ''); setShowClient(false) }} placeholder="— найти покупателя —" />
              </div>
            )}

            <button onClick={() => setShowCatalog(true)} style={{ border: 'none', background: PRIMARY, color: '#fff', borderRadius: 14, padding: '18px 16px', cursor: 'pointer', fontSize: 18, fontWeight: 800, fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(212,97,58,.35)' }}>📖 Каталог</button>

            {rows.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: 28, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc', color: '#8a8377' }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>🧾</div>
                <div style={{ fontWeight: 600, color: '#5f5952' }}>Чек пустой</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Нажмите «Каталог» и выберите товар</div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1px #e6e2dc', overflow: 'hidden' }}>
                {rows.map(r => {
                  const perCm = isIzdelie(r.name1c)
                  const sum = lineAmount({ name: r.name1c, qty: r.qty, price: r.price, widthCm: r.widthCm })
                  return (
                    <div key={r.key} style={{ padding: '10px 12px', borderBottom: '1px solid #f4f1ed', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, fontSize: 14.5, fontWeight: 600, lineHeight: 1.25 }}>{r.name1c}</div>
                        <button onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} style={{ border: 'none', background: '#f7f5f2', color: '#c0532a', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14 }}>🗑</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => patchRow(r.key, { qty: Math.max(1, r.qty - 1) })} style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 17, cursor: 'pointer' }}>−</button>
                        <input value={String(r.qty)} inputMode="decimal" onChange={e => patchRow(r.key, { qty: Math.max(0, num(e.target.value.replace(/[^0-9.,]/g, ''))) })} style={{ ...input, width: 58, textAlign: 'center', fontSize: 15 }} />
                        <button onClick={() => patchRow(r.key, { qty: r.qty + 1 })} style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 17, cursor: 'pointer' }}>+</button>
                        <span style={{ fontSize: 12, color: '#8a8377' }}>{r.unit}{r.widthCm ? ` · ${r.widthCm} см` : ''}</span>
                        <input value={r.price ? String(r.price) : ''} inputMode="decimal" placeholder={perCm ? '₸/см' : '₸'} onChange={e => patchRow(r.key, { price: num(e.target.value.replace(/[^0-9.,]/g, '')) })} style={{ ...input, marginLeft: 'auto', width: 92, fontSize: 14 }} />
                        <span style={{ fontSize: 14.5, fontWeight: 800, minWidth: 76, textAlign: 'right' }}>{money(sum)}</span>
                      </div>
                    </div>
                  )
                })}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: '#faf8f6' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em' }}>ИТОГО</span>
                  <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800 }}>{money(total)} ₸</span>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 0 0 1px #e6e2dc', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Наличка<input value={pay.cash} inputMode="decimal" onChange={e => setPay(p => ({ ...p, cash: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...input, marginTop: 3 }} /></label>
                  <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Каспи<input value={pay.kaspi} inputMode="decimal" onChange={e => setPay(p => ({ ...p, kaspi: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...input, marginTop: 3 }} /></label>
                  <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>QR<input value={pay.qr} inputMode="decimal" onChange={e => setPay(p => ({ ...p, qr: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...input, marginTop: 3 }} /></label>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setPay(p => ({ ...p, cash: String(Math.round(total)), kaspi: '', qr: '' }))} style={{ flex: 1, padding: '9px 6px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Всё нал</button>
                  <button onClick={() => setPay(p => ({ ...p, kaspi: String(Math.round(total)), cash: '', qr: '' }))} style={{ flex: 1, padding: '9px 6px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Всё каспи</button>
                  <button onClick={() => setPay({ cash: '', kaspi: '', qr: '', change: '', changeFrom: '' })} style={{ flex: 1, padding: '9px 6px', borderRadius: 9, border: '1.5px solid #e6c9b8', background: '#fff8f5', color: '#c0532a', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>В долг</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: '#5f5952' }}>Сдача</span>
                  <input value={pay.change} inputMode="decimal" onChange={e => setPay(p => ({ ...p, change: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ ...input, width: 84, fontSize: 14 }} />
                  <span style={{ marginLeft: 'auto', fontSize: 14.5, fontWeight: 800, color: debtN > 0 ? '#c0532a' : '#2e8a5e' }}>долг {money(debtN)} ₸</span>
                </div>
                <button disabled={busy} onClick={doSell} style={{ border: 'none', background: busy ? '#9bb5a6' : '#2e8a5e', color: '#fff', borderRadius: 12, padding: '16px', cursor: busy ? 'default' : 'pointer', fontSize: 17, fontWeight: 800, fontFamily: 'inherit' }}>{busy ? '…' : `💵 Продать · ${money(total)} ₸`}</button>
              </div>
            )}
          </div>
        )}

        {tab === 'checks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sold.length === 0 && <div style={{ background: '#fff', borderRadius: 12, padding: 30, textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc', color: '#8a8377' }}>Продаж пока нет</div>}
            {sold.map((o: any) => (
              <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 0 0 1px #e6e2dc', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#2e8a5e' }}>{o.id}</div>
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
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: Number(s.qty) < 0 ? '#c0532a' : '#26231f' }}>{Number(s.qty).toLocaleString('ru-RU')} {p?.unit || 'шт'}</div>
                  </div>
                )
              })}
          </div>
        )}

        {tab === 'shift' && <ShiftView uid={user.id} />}
        {tab === 'docs' && <DocsView orgId={user.orgId} />}
        {tab === 'finance' && <FinanceView />}
      </div>

      {/* нижняя панель — под большой палец */}
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
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, border: 'none', background: 'none', padding: '9px 2px 11px', cursor: 'pointer', fontFamily: 'inherit', color: active ? PRIMARY : '#8a8377' }}>
              <div style={{ fontSize: 19 }}>{icon}</div>
              <div style={{ fontSize: 11, fontWeight: active ? 800 : 600 }}>{label}</div>
            </button>
          )
        })}
      </div>

      {showCatalog && <NomPicker onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}
      <PushSetup />
    </div>
  )
}
