'use client'
// Склад — портирован из Улкана 1:1 (KPI, остатки с резервом + прогресс, движения
// по вкладкам, ручной приход). API → /api/stock (overview/movements/income).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLORS } from '@/lib/colors'
import { stockOverview, stockMovements, stockIncome, fetchRefs, listFolders } from '@/lib/api/refs'
import { createTransfer } from '@/lib/api/docs'
import NomInline from '@/components/NomInline'

interface StockItem { id: string; name: string; unit: string; qty: number; reserved: number; cat?: string }
interface Movement { id: string; type: 'income' | 'reserve' | 'expense'; name: string; qty: number; unit: string; cardId?: string; createdAt: string }
type MovTab = 'all' | 'income' | 'reserve' | 'expense'

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div style={{ height: 4, background: '#f1efec', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: 'width .4s' }} /></div>
}
function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string; icon: string }> = {
    income: { label: 'Приход', bg: '#e8f5ee', color: '#2e8a5e', icon: '📥' },
    reserve: { label: 'Резерв', bg: '#eef2ff', color: '#4a5aaa', icon: '🔒' },
    expense: { label: 'Расход', bg: '#faeaea', color: '#b03020', icon: '📤' },
  }
  const s = map[type] || { label: type, bg: '#f1efec', color: '#5f5952', icon: '•' }
  return <span style={{ fontSize: 12, fontWeight: 600, background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>
}
const fmtQty = (type: string, qty: number) => (type === 'income' ? `+${qty}` : `−${qty}`)
function fmtTime(iso: string): string {
  const d = new Date(iso); const diff = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diff < 1) return 'только что'; if (diff < 60) return `${diff} мин`; if (diff < 1440) return `${Math.floor(diff / 60)} ч`
  if (diff < 2880) return 'вчера'; return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function IncomeModal({ products, onClose, onSubmit }: { products: any[]; onClose: () => void; onSubmit: (name: string, qty: number, unit: string) => Promise<void> }) {
  const [pid, setPid] = useState(''); const [pname, setPname] = useState(''); const [qty, setQty] = useState(''); const [unit, setUnit] = useState('шт'); const [loading, setLoading] = useState(false)
  async function handle() { const name = pname.trim(); if (!name || !qty) return; setLoading(true); await onSubmit(name, Number(qty), unit); setLoading(false); onClose() }
  const INP: React.CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>📥 Приход на склад</div>
        <div style={{ fontSize: 14, color: '#5f5952', marginBottom: 20 }}>Центр-Склад · ручной приход</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={LBL}>ТОВАР ИЗ НОМЕНКЛАТУРЫ</label><NomInline products={products} value={pid} name={pid ? pname : ''} onPick={p => { setPid(p.id); setPname(p.name); setUnit(p.unit || 'шт') }} /></div>
          <div><label style={LBL}>ИЛИ ВВЕДИТЕ ВРУЧНУЮ</label><input style={INP} value={pid ? '' : pname} onChange={e => { setPid(''); setPname(e.target.value) }} placeholder="название товара..." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label style={LBL}>КОЛИЧЕСТВО *</label><input style={INP} type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" min="0.01" step="0.01" /></div>
            <div><label style={LBL}>ЕД.</label><input style={INP} value={unit} onChange={e => setUnit(e.target.value)} placeholder="шт" /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
          <button onClick={handle} disabled={loading || !pname.trim() || !qty} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: loading ? .6 : 1 }}>{loading ? 'Добавляю...' : '+ Добавить на склад'}</button>
        </div>
      </div>
    </div>
  )
}

// Перемещение товара на склад филиала (напр. головной шлёт листы филиалу-производителю).
function TransferModal({ srcWh, dests, orgs, products, stock, onClose, onDone }: { srcWh: any; dests: any[]; orgs: any[]; products: any[]; stock: StockItem[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [toWh, setToWh] = useState(dests[0]?.id || '')
  const [rows, setRows] = useState<{ productId: string; qty: string; unit: string }[]>([{ productId: '', qty: '', unit: '' }])
  const [loading, setLoading] = useState(false)
  const INP: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  const orgOf = (whId: string) => { const w = dests.find(d => d.id === whId); const o = orgs.find(x => x.id === w?.orgId); return { name: o?.name || '', color: o?.color || '#6b7280', whName: w?.name || '' } }
  const setRow = (i: number, patch: any) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const availOf = (pid: string) => { const s = stock.find(x => x.id === pid); return s ? Math.max(0, s.qty - s.reserved) : 0 }
  const valid = !!toWh && rows.some(r => r.productId && Number(r.qty) > 0)
  async function submit() {
    const lines = rows.filter(r => r.productId && Number(r.qty) > 0).map(r => ({ productId: r.productId, qty: Number(r.qty), unit: r.unit || 'шт', price: 0 }))
    if (!lines.length) return
    setLoading(true)
    const r: any = await createTransfer({ fromWarehouseId: srcWh.id, toWarehouseId: toWh, lines })
    setLoading(false)
    if (r.ok || r.id) { onDone(`✓ Отправлено ${lines.length} поз. → «${orgOf(toWh).whName}»`); onClose() } else onDone('⚠ ' + (r.error || 'Ошибка перемещения'))
  }
  const dest = orgOf(toWh)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>🚚 Отправить на склад филиала</div>
        <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 16 }}>Со склада <b>«{srcWh?.name}»</b> — списание здесь, приход у филиала.</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }}>КУДА (ФИЛИАЛ / СКЛАД)</label>
          <select style={{ ...INP, borderLeft: `4px solid ${dest.color}` }} value={toWh} onChange={e => setToWh(e.target.value)}>
            {dests.map(d => { const o = orgs.find(x => x.id === d.orgId); return <option key={d.id} value={d.id}>{o?.name || ''} — {d.name}</option> })}
          </select>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 6, letterSpacing: '.04em' }}>ЧТО ОТПРАВЛЯЕМ (из остатков)</div>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => {
            const avail = availOf(r.productId); const over = !!r.productId && Number(r.qty) > avail
            const pname = products.find(p => p.id === r.productId)?.name || ''
            return (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <NomInline products={products} value={r.productId} name={pname} onPick={p => setRow(i, { productId: p.id, unit: p.unit || 'шт' })} />
                  {r.productId && <div style={{ fontSize: 11, color: over ? '#b03020' : '#837c72', marginTop: 2 }}>на складе: {avail} {r.unit}{over ? ' — больше, чем есть!' : ''}</div>}
                </div>
                <input style={{ ...INP, width: 84, textAlign: 'right' }} type="number" placeholder="кол-во" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} />
                <span style={{ fontSize: 12, color: '#837c72', width: 40, flexShrink: 0, paddingTop: 9 }}>{r.unit}</span>
                <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ border: 'none', background: 'none', color: '#b03020', fontSize: 16, cursor: 'pointer', flexShrink: 0, paddingTop: 6 }}>×</button>
              </div>
            )
          })}
        </div>
        <button onClick={() => setRows(rs => [...rs, { productId: '', qty: '', unit: '' }])} style={{ marginTop: 8, alignSelf: 'flex-start', border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '5px 14px', background: 'none', cursor: 'pointer', fontSize: 13, color: '#5f5952', fontFamily: 'inherit' }}>＋ Ещё позиция</button>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
          <button onClick={submit} disabled={!valid || loading} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: valid ? COLORS.primary : '#e6e2dc', color: '#fff', cursor: valid ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: loading ? .6 : 1 }}>{loading ? 'Отправляю...' : '🚚 Отправить →'}</button>
        </div>
      </div>
    </div>
  )
}

export default function WarehouseScreen({ orgId, onOpenCard }: { orgId: string; onOpenCard?: (cardId: string) => void }) {
  const [stock, setStock] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [movTab, setMovTab] = useState<MovTab>('all')
  const [search, setSearch] = useState('')
  const [showIncome, setShowIncome] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [whs, setWhs] = useState<any[]>([])
  const [orgs, setOrgs] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [toast, setToast] = useState('')
  useEffect(() => { fetchRefs().then((r: any) => { setWhs(r.warehouses || []); setOrgs(r.organizations || []); setProducts(r.products || []) }) }, [])
  const srcWh = whs.find(w => w.orgId === orgId && w.isCentral) || whs.find(w => w.orgId === orgId)
  const dests = whs.filter(w => w.orgId !== orgId)   // склады других орг/филиалов

  // Дерево номенклатуры на складе: те же папки/группы, что в номенклатуре (товары общие),
  // остатки — этой организации (склад отдельный).
  const [folders, setFolders] = useState<any[]>([])
  useEffect(() => { listFolders().then((f: any) => setFolders(f || [])) }, [])
  const [selGroup, setSelGroup] = useState<string | null>(null)
  const [selCat, setSelCat] = useState<string | null>(null)
  const [selSub, setSelSub] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({})
  const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')
  const pMap = useMemo(() => new Map(products.map((p: any) => [p.id, p])), [products])
  const inGroup = (g: string, x: any) => norm(x.group) === norm(g) || norm(x.cat) === norm(g)
  const inCat = (g: string, c: string, x: any) => (norm(x.group) === norm(g) && norm(x.cat) === norm(c)) || (norm(x.group) === norm(c) && norm(x.cat) === norm(g))
  const tree = useMemo(() => {
    const t: Record<string, Record<string, string[]>> = {}
    const eG = (g: string) => { if (g && !t[g]) t[g] = {} }
    const eC = (g: string, c: string) => { eG(g); if (c && t[g] && !t[g][c]) t[g][c] = [] }
    const eS = (g: string, c: string, s: string) => { eC(g, c); if (s && t[g]?.[c] && !t[g][c].includes(s)) t[g][c].push(s) }
    for (const f of folders) { if (f.sub) eS(f.grp, f.cat, f.sub); else if (f.cat) eC(f.grp, f.cat); else if (f.grp) eG(f.grp) }
    for (const p of products) { if (p.group) { eG(p.group); if (p.cat) { eC(p.group, p.cat); if (p.subgroup) eS(p.group, p.cat, p.subgroup) } } }
    return t
  }, [folders, products])
  const groupsList = Object.keys(tree)
  const stockRows = useMemo(() => stock.map(s => { const p: any = pMap.get(s.id); return { ...s, group: p?.group || '', cat: p?.cat || '', subgroup: p?.subgroup || '' } }), [stock, pMap])
  const cGroup = (g: string) => stockRows.filter(s => inGroup(g, s)).length
  const cCat = (g: string, c: string) => stockRows.filter(s => inCat(g, c, s)).length
  const cSub = (g: string, c: string, sub: string) => stockRows.filter(s => inCat(g, c, s) && norm(s.subgroup) === norm(sub)).length
  const filteredStock = stockRows.filter(s => {
    if (search) return s.name.toLowerCase().includes(search.toLowerCase())
    if (selSub) return inCat(selGroup!, selCat!, s) && norm(s.subgroup) === norm(selSub)
    if (selCat) return inCat(selGroup!, selCat!, s)
    if (selGroup) return inGroup(selGroup, s)
    return true
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, m] = await Promise.all([stockOverview(orgId), stockMovements(orgId)])
      setStock(s as any); setMovements(m as any)
    } catch {} finally { setLoading(false) }
  }, [orgId])
  useEffect(() => { load() }, [load])

  function showMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2300) }
  async function handleIncome(name: string, qty: number, unit: string) {
    const r = await stockIncome({ name, qty, unit })
    if (r.ok) { showMsg(`✓ Приход: ${name} ${qty} ${unit}`); load() } else showMsg('Ошибка')
  }

  const filteredMovements = movements.filter(m => movTab === 'all' || m.type === movTab)
  const totalItems = stock.length
  const reservedCount = stock.filter(s => s.reserved > 0).length
  const incomeCount = movements.filter(m => m.type === 'income').length
  const expenseCount = movements.filter(m => m.type === 'expense').length

  const pilBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: active ? COLORS.primary : '#fff', color: active ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc' })

  return (
    <div className="anim-fade">
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, whiteSpace: 'nowrap' }}>{toast}</div>}
      {showIncome && <IncomeModal products={products} onClose={() => setShowIncome(false)} onSubmit={handleIncome} />}
      {showTransfer && srcWh && <TransferModal srcWh={srcWh} dests={dests} orgs={orgs} products={products} stock={stock} onClose={() => setShowTransfer(false)} onDone={msg => { showMsg(msg); load() }} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>🏭 {srcWh?.name || 'Склад'}</div>
          <div style={{ fontSize: 13, color: '#5f5952', marginTop: 2 }}>Остатки по номенклатуре · движение товаров</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>⟳ Обновить</button>
          {dests.length > 0 && srcWh && <button onClick={() => setShowTransfer(true)} style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>🚚 Отправить филиалу</button>}
          <button onClick={() => setShowIncome(true)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>+ Приход</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Позиций', val: totalItems, sub: 'наименований', color: '#211f1c', bg: '#fff' },
          { label: 'В резерве', val: reservedCount, sub: 'товаров заморожено', color: '#4a5aaa', bg: '#eef2ff' },
          { label: 'Приходов', val: incomeCount, sub: 'операций всего', color: '#2e8a5e', bg: '#e8f5ee' },
          { label: 'Расходов', val: expenseCount, sub: 'операций всего', color: '#b03020', bg: '#faeaea' },
        ].map(({ label, val, sub, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 12, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5f5952', marginBottom: 4, letterSpacing: '.04em' }}>{label.toUpperCase()}</div>
            <div style={{ fontWeight: 700, fontSize: 28, color, lineHeight: 1 }}>{loading ? '—' : val}</div>
            <div style={{ fontSize: 12, color: '#5f5952', marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Дерево номенклатуры (те же папки, что в номенклатуре) */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
          <div style={{ padding: '9px 14px', background: '#f8f6f3', borderBottom: '1px solid #e6e2dc', fontSize: 12, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em' }}>ГРУППЫ</div>
          <div style={{ maxHeight: 'calc(100vh - 330px)', overflowY: 'auto' }}>
            <div onClick={() => { setSelGroup(null); setSelCat(null); setSelSub(null); setSearch('') }} style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14, fontWeight: !selGroup && !search ? 700 : 400, color: !selGroup && !search ? COLORS.primary : '#26231f', display: 'flex', justifyContent: 'space-between', background: !selGroup && !search ? '#fff8f5' : '#fff' }}><span>Все</span><span style={{ fontSize: 12, color: '#5f5952' }}>{stockRows.length}</span></div>
            {groupsList.map(g => {
              const cats = Object.keys(tree[g]); const isOpen = openGroups[g]; const isSelG = selGroup === g && !selCat
              return (
                <div key={g}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', cursor: 'pointer', background: isSelG ? '#fff8f5' : '#fff' }} onClick={() => { setSelGroup(g); setSelCat(null); setSelSub(null); setSearch('') }}>
                    <span onClick={e => { e.stopPropagation(); setOpenGroups(p => ({ ...p, [g]: !p[g] })) }} style={{ marginRight: 6, fontSize: 11, color: '#5f5952', width: 12, textAlign: 'center' }}>{cats.length ? (isOpen ? '▼' : '▶') : ''}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: isSelG ? 700 : 400, color: isSelG ? COLORS.primary : '#26231f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {g}</span>
                    <span style={{ fontSize: 12, color: '#5f5952' }}>{cGroup(g)}</span>
                  </div>
                  {isOpen && cats.map(cat => {
                    const subs = tree[g][cat]; const isCatOpen = openCats[`${g}/${cat}`]; const isSelC = selGroup === g && selCat === cat && !selSub
                    return (
                      <div key={cat}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '7px 14px 7px 26px', cursor: 'pointer', background: isSelC ? '#fff8f5' : '#fff' }} onClick={() => { setSelGroup(g); setSelCat(cat); setSelSub(null); setSearch('') }}>
                          <span onClick={e => { e.stopPropagation(); setOpenCats(p => ({ ...p, [`${g}/${cat}`]: !p[`${g}/${cat}`] })) }} style={{ marginRight: 6, fontSize: 11, color: '#5f5952', width: 10, textAlign: 'center' }}>{subs.length ? (isCatOpen ? '▼' : '▶') : ''}</span>
                          <span style={{ flex: 1, fontSize: 12.5, fontWeight: isSelC ? 700 : 400, color: isSelC ? COLORS.primary : '#4a4640', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📂 {cat}</span>
                          <span style={{ fontSize: 12, color: '#5f5952' }}>{cCat(g, cat)}</span>
                        </div>
                        {isCatOpen && subs.map(sub => {
                          const isSelS = selGroup === g && selCat === cat && selSub === sub
                          return (
                            <div key={sub} onClick={() => { setSelGroup(g); setSelCat(cat); setSelSub(sub); setSearch('') }} style={{ display: 'flex', alignItems: 'center', padding: '6px 14px 6px 42px', cursor: 'pointer', background: isSelS ? '#fff8f5' : '#fff' }}>
                              <span style={{ flex: 1, fontSize: 12.5, fontWeight: isSelS ? 700 : 400, color: isSelS ? COLORS.primary : '#6b655b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {sub}</span>
                              <span style={{ fontSize: 12, color: '#5f5952' }}>{cSub(g, cat, sub)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Остатки выбранной папки */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Остатки{selGroup ? <span style={{ fontWeight: 400, color: '#5f5952' }}> · {selSub || selCat || selGroup}</span> : ''}</div>
            <input style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid #e6e2dc', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: 220 }} placeholder="🔍 Поиск по складу..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {loading ? <div style={{ color: '#5f5952', fontSize: 14, padding: '20px 0' }}>Загрузка...</div>
            : filteredStock.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14, padding: 20, background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', textAlign: 'center' }}>{search ? 'Ничего не найдено' : (selGroup ? 'В этой папке остатков нет' : 'На складе пусто')}</div>
            : (
              <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f8f6f3' }}>{['НОМЕНКЛАТУРА', 'ЕД.', 'НА СКЛАДЕ', 'РЕЗЕРВ', 'ДОСТУПНО'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: h === 'НОМЕНКЛАТУРА' ? 'left' : 'center', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredStock.map((s, i) => {
                      const available = Math.max(0, s.qty - s.reserved)
                      const availPct = s.qty > 0 ? Math.round(available / s.qty * 100) : 0
                      const isLow = available === 0 && s.qty > 0, isCrit = s.qty === 0
                      return (
                        <tr key={s.id} style={{ borderTop: i > 0 ? '1px solid #f1efec' : 'none', background: isCrit ? '#fff5f5' : isLow ? '#fffbf0' : '#fff' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                            {s.cat && <div style={{ fontSize: 12, color: '#5f5952' }}>{s.cat}</div>}
                            <Bar pct={availPct} color={availPct >= 50 ? '#3a9d6e' : availPct > 0 ? '#c4a832' : '#d4613a'} />
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, color: '#5f5952' }}>{s.unit}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 14, fontWeight: 700 }}>{s.qty}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>{s.reserved > 0 ? <span style={{ fontSize: 13, fontWeight: 600, background: '#eef2ff', color: '#4a5aaa', padding: '2px 8px', borderRadius: 20 }}>🔒 {s.reserved}</span> : <span style={{ fontSize: 13, color: '#837c72' }}>—</span>}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: available === 0 ? '#b03020' : available < s.qty * 0.2 ? '#c4a832' : '#2e8a5e' }}>{available}</span>
                            {isLow && <div style={{ fontSize: 12, color: '#b03020', fontWeight: 600 }}>всё резерв</div>}
                            {isCrit && <div style={{ fontSize: 12, color: '#b03020', fontWeight: 600 }}>нет на складе</div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredStock.length > 0 && (
                  <div style={{ padding: '10px 14px', background: '#f8f6f3', borderTop: '1px solid #e6e2dc', display: 'flex', gap: 20, fontSize: 13, color: '#5f5952', flexWrap: 'wrap' }}>
                    <span>Итого позиций: <b style={{ color: '#26231f' }}>{filteredStock.length}</b></span>
                    <span>Всего в резерве: <b style={{ color: '#4a5aaa' }}>{filteredStock.reduce((s, i) => s + i.reserved, 0)}</b></span>
                    <span>Доступно товаров: <b style={{ color: '#2e8a5e' }}>{filteredStock.reduce((s, i) => s + Math.max(0, i.qty - i.reserved), 0)}</b></span>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Движение — под остатками, во всю ширину */}
      <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Движение</div>
          <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
            {([['all', `Все (${movements.length})`], ['income', `📥 Приход (${incomeCount})`], ['reserve', `🔒 Резервы (${movements.filter(m => m.type === 'reserve').length})`], ['expense', `📤 Расход (${expenseCount})`]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setMovTab(key)} style={pilBtn(movTab === key)}>{label}</button>
            ))}
          </div>
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
            {loading ? <div style={{ padding: '20px', color: '#5f5952', fontSize: 14 }}>Загрузка...</div>
              : filteredMovements.length === 0 ? <div style={{ padding: '20px', color: '#5f5952', fontSize: 14, textAlign: 'center' }}>Нет движений</div>
              : filteredMovements.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < filteredMovements.length - 1 ? '1px solid #f1efec' : 'none' }}>
                  <TypeBadge type={m.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    {m.cardId ? <button onClick={() => onOpenCard?.(m.cardId!)} style={{ fontSize: 12, color: COLORS.primary, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}>{m.cardId} →</button> : <div style={{ fontSize: 12, color: '#837c72' }}>ручной приход</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: m.type === 'income' ? '#2e8a5e' : m.type === 'reserve' ? '#4a5aaa' : '#b03020' }}>{fmtQty(m.type, m.qty)} {m.unit}</div>
                    <div style={{ fontSize: 12, color: '#5f5952' }}>{fmtTime(m.createdAt)}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
    </div>
  )
}
