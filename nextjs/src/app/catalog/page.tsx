'use client'
import { useEffect, useState, Fragment } from 'react'
import { PRODUCT_GROUPS, PRODUCT_CATEGORIES, CONTRAGENT_KINDS } from '@/lib/catalog'
import { pickOrg, forOrg } from '@/lib/org'

type Tab = 'products' | 'contragents' | 'warehouses' | 'cash'
const TABS: { k: Tab; l: string }[] = [
  { k: 'products', l: '📦 Номенклатура' }, { k: 'contragents', l: '👥 Контрагенты' },
  { k: 'warehouses', l: '🏬 Склады' }, { k: 'cash', l: '💵 Кассы' },
]
const inp = 'border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500'
const catLabel = (v: string) => PRODUCT_CATEGORIES.find(c => c.value === v)?.label || v
const kindLabel = (v: string) => CONTRAGENT_KINDS.find(c => c.value === v)?.label || v
const num = (v: any) => Number(v).toLocaleString('ru-RU')
const emptyProd = { name: '', unit: 'шт', category: 'goods', group: '', subgroup: '', priceIn: '', priceRetail: '', priceOpt: '' }
const emptyCon = { name: '', kind: 'client', priceType: 'retail', phone: '' }

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>('products')
  const [orgId, setOrgId] = useState('')
  const [refs, setRefs] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [contragents, setContragents] = useState<any[]>([])
  const [msg, setMsg] = useState('')

  async function load() {
    const [r, prods, cons] = await Promise.all([
      fetch('/api/refs').then(x => x.json()),
      fetch('/api/products?all=1').then(x => x.json()),
      fetch('/api/contragents?all=1').then(x => x.json()),
    ])
    setRefs(r); setProducts(prods); setContragents(cons)
    const org = pickOrg<{ id: string }>(r.organizations)
    if (org) setOrgId(org.id)
  }
  useEffect(() => { load() }, [])

  async function send(url: string, method: 'POST' | 'PATCH', body: any) {
    setMsg('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(data.error || 'Ошибка'); return false }
    setMsg('✅ Сохранено'); await load(); return true
  }
  const post = (url: string, body: any) => send(url, 'POST', body)
  const patch = (url: string, body: any) => send(url, 'PATCH', body)

  if (!refs) return <div className="p-8 text-neutral-500">Загрузка…</div>

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">📚 Справочники</h1>
      <div className="flex gap-1 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.k} onClick={() => { setTab(t.k); setMsg('') }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === t.k ? 'bg-orange-600 text-white' : 'bg-white ring-1 ring-neutral-200 text-neutral-600'}`}>{t.l}</button>
        ))}
      </div>
      {msg && <div className="mb-3 text-sm">{msg}</div>}

      {tab === 'products' && <Products products={products}
        onAdd={b => post('/api/products', b)} onSave={(id, b) => patch(`/api/products/${id}`, b)} onArchive={p => patch(`/api/products/${p.id}`, { archived: !p.archived })} />}
      {tab === 'contragents' && <Contragents items={forOrg(contragents, orgId)} orgId={orgId}
        onAdd={b => post('/api/contragents', b)} onSave={(id, b) => patch(`/api/contragents/${id}`, b)} onArchive={c => patch(`/api/contragents/${c.id}`, { archived: !c.archived })} />}
      {tab === 'warehouses' && <Warehouses items={forOrg(refs.warehouses, orgId)} orgId={orgId} onAdd={b => post('/api/warehouses', b)} />}
      {tab === 'cash' && <CashAccounts items={forOrg(refs.cashAccounts, orgId)} orgId={orgId} onAdd={b => post('/api/cash-accounts', b)} />}
    </main>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl ring-1 ring-neutral-200 p-5 mb-5">{children}</div>
}
function List({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-neutral-200 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">{head.map((h, i) => <th key={i} className="text-left px-4 py-2">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
const editBtn = 'text-orange-600 hover:underline text-xs font-semibold'
const archBtn = 'text-neutral-500 hover:underline text-xs'
function Actions({ archived, onEdit, onArchive }: { archived: boolean; onEdit: () => void; onArchive: () => void }) {
  return (
    <div className="flex gap-3 justify-end">
      <button className={editBtn} onClick={onEdit}>Изм.</button>
      <button className={archBtn} onClick={onArchive}>{archived ? '♻ Вернуть' : '🗃 В архив'}</button>
    </div>
  )
}

// ─── Товары ──────────────────────────────────────────────────────────────
function ProductFields({ v, set }: { v: any; set: (x: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-2">
      <input className={`${inp} col-span-2`} placeholder="Наименование" value={v.name} onChange={e => set({ ...v, name: e.target.value })} />
      <select className={inp} value={v.group} onChange={e => set({ ...v, group: e.target.value })}>
        <option value="">— группа —</option>{PRODUCT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
      <select className={inp} value={v.category} onChange={e => set({ ...v, category: e.target.value })}>
        {PRODUCT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <input className={inp} placeholder="Ед. (шт/м2)" value={v.unit} onChange={e => set({ ...v, unit: e.target.value })} />
      <input className={inp} placeholder="Подгруппа (необяз.)" value={v.subgroup} onChange={e => set({ ...v, subgroup: e.target.value })} />
      <input className={inp} type="number" placeholder="Цена приход" value={v.priceIn} onChange={e => set({ ...v, priceIn: e.target.value })} />
      <input className={inp} type="number" placeholder="Цена розн." value={v.priceRetail} onChange={e => set({ ...v, priceRetail: e.target.value })} />
      <input className={inp} type="number" placeholder="Цена опт" value={v.priceOpt} onChange={e => set({ ...v, priceOpt: e.target.value })} />
    </div>
  )
}

function Products({ products, onAdd, onSave, onArchive }: { products: any[]; onAdd: (b: any) => Promise<boolean>; onSave: (id: string, b: any) => Promise<boolean>; onArchive: (p: any) => Promise<boolean> }) {
  const [f, setF] = useState(emptyProd)
  const [editId, setEditId] = useState<string | null>(null)
  const [ef, setEf] = useState<any>(emptyProd)
  function startEdit(p: any) {
    setEditId(p.id)
    setEf({ name: p.name, unit: p.unit, category: p.category, group: p.group || '', subgroup: p.subgroup || '', priceIn: String(p.priceIn), priceRetail: String(p.priceRetail), priceOpt: String(p.priceOpt) })
  }
  return (
    <>
      <Card>
        <div className="text-xs font-bold text-neutral-500 mb-3">НОВЫЙ ТОВАР</div>
        <ProductFields v={f} set={setF} />
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2 disabled:opacity-50" disabled={!f.name.trim()}
          onClick={async () => { if (await onAdd(f)) setF(emptyProd) }}>Добавить товар</button>
      </Card>
      <div className="text-xs font-bold text-neutral-500 mb-2">ТОВАРЫ ({products.length})</div>
      <List head={['Наименование', 'Группа', 'Тип', 'Ед.', 'Приход', 'Розн.', 'Опт', '']}>
        {products.map(p => (
          <Fragment key={p.id}>
            <tr className={`border-t border-neutral-100 ${p.archived ? 'opacity-45' : ''}`}>
              <td className="px-4 py-2 font-medium">{p.name}{p.archived && <span className="ml-2 text-[10px] bg-neutral-200 text-neutral-600 rounded px-1.5 py-0.5">архив</span>}</td>
              <td className="px-4 py-2 text-neutral-500">{p.group || '—'}</td>
              <td className="px-4 py-2 text-neutral-500">{catLabel(p.category)}</td>
              <td className="px-4 py-2 text-neutral-500">{p.unit}</td>
              <td className="px-4 py-2 tabular-nums">{num(p.priceIn)}</td>
              <td className="px-4 py-2 tabular-nums">{num(p.priceRetail)}</td>
              <td className="px-4 py-2 tabular-nums">{num(p.priceOpt)}</td>
              <td className="px-4 py-2"><Actions archived={p.archived} onEdit={() => (editId === p.id ? setEditId(null) : startEdit(p))} onArchive={() => onArchive(p)} /></td>
            </tr>
            {editId === p.id && (
              <tr><td colSpan={8} className="bg-orange-50/60 px-4 py-4">
                <div className="text-xs font-bold text-neutral-500 mb-3">ПРАВКА ТОВАРА</div>
                <ProductFields v={ef} set={setEf} />
                <div className="flex gap-2">
                  <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2 disabled:opacity-50" disabled={!ef.name.trim()}
                    onClick={async () => { if (await onSave(p.id, ef)) setEditId(null) }}>Сохранить</button>
                  <button className="text-sm font-semibold text-neutral-500 px-3" onClick={() => setEditId(null)}>Отмена</button>
                </div>
              </td></tr>
            )}
          </Fragment>
        ))}
      </List>
    </>
  )
}

// ─── Контрагенты ─────────────────────────────────────────────────────────
function ContragentFields({ v, set }: { v: any; set: (x: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-2">
      <input className={`${inp} col-span-2`} placeholder="Название" value={v.name} onChange={e => set({ ...v, name: e.target.value })} />
      <select className={inp} value={v.kind} onChange={e => set({ ...v, kind: e.target.value })}>{CONTRAGENT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
      <select className={inp} value={v.priceType} onChange={e => set({ ...v, priceType: e.target.value })}><option value="retail">Розничная цена</option><option value="opt">Оптовая цена</option></select>
      <input className={`${inp} col-span-2`} placeholder="Телефон (необяз.)" value={v.phone} onChange={e => set({ ...v, phone: e.target.value })} />
    </div>
  )
}

function Contragents({ items, orgId, onAdd, onSave, onArchive }: { items: any[]; orgId: string; onAdd: (b: any) => Promise<boolean>; onSave: (id: string, b: any) => Promise<boolean>; onArchive: (c: any) => Promise<boolean> }) {
  const [f, setF] = useState(emptyCon)
  const [editId, setEditId] = useState<string | null>(null)
  const [ef, setEf] = useState<any>(emptyCon)
  function startEdit(c: any) { setEditId(c.id); setEf({ name: c.name, kind: c.kind, priceType: c.priceType, phone: c.phone || '' }) }
  return (
    <>
      <Card>
        <div className="text-xs font-bold text-neutral-500 mb-3">НОВЫЙ КОНТРАГЕНТ</div>
        <ContragentFields v={f} set={setF} />
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2 disabled:opacity-50" disabled={!f.name.trim() || !orgId}
          onClick={async () => { if (await onAdd({ ...f, orgId })) setF(emptyCon) }}>Добавить контрагента</button>
      </Card>
      <div className="text-xs font-bold text-neutral-500 mb-2">КОНТРАГЕНТЫ ({items.length})</div>
      <List head={['Название', 'Тип', 'Цена', 'Телефон', '']}>
        {items.map(c => (
          <Fragment key={c.id}>
            <tr className={`border-t border-neutral-100 ${c.archived ? 'opacity-45' : ''}`}>
              <td className="px-4 py-2 font-medium">{c.name}{c.archived && <span className="ml-2 text-[10px] bg-neutral-200 text-neutral-600 rounded px-1.5 py-0.5">архив</span>}</td>
              <td className="px-4 py-2 text-neutral-500">{kindLabel(c.kind)}</td>
              <td className="px-4 py-2 text-neutral-500">{c.priceType === 'opt' ? 'опт' : 'розн'}</td>
              <td className="px-4 py-2 text-neutral-500">{c.phone || '—'}</td>
              <td className="px-4 py-2"><Actions archived={c.archived} onEdit={() => (editId === c.id ? setEditId(null) : startEdit(c))} onArchive={() => onArchive(c)} /></td>
            </tr>
            {editId === c.id && (
              <tr><td colSpan={5} className="bg-orange-50/60 px-4 py-4">
                <div className="text-xs font-bold text-neutral-500 mb-3">ПРАВКА КОНТРАГЕНТА</div>
                <ContragentFields v={ef} set={setEf} />
                <div className="flex gap-2">
                  <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2 disabled:opacity-50" disabled={!ef.name.trim()}
                    onClick={async () => { if (await onSave(c.id, ef)) setEditId(null) }}>Сохранить</button>
                  <button className="text-sm font-semibold text-neutral-500 px-3" onClick={() => setEditId(null)}>Отмена</button>
                </div>
              </td></tr>
            )}
          </Fragment>
        ))}
      </List>
    </>
  )
}

// ─── Склады / Кассы (без изменений) ──────────────────────────────────────
function Warehouses({ items, orgId, onAdd }: { items: any[]; orgId: string; onAdd: (b: any) => Promise<boolean> }) {
  const [f, setF] = useState({ name: '', isCentral: false })
  return (
    <>
      <Card>
        <div className="text-xs font-bold text-neutral-500 mb-3">НОВЫЙ СКЛАД</div>
        <div className="flex gap-2 items-center mb-2">
          <input className={`${inp} flex-1`} placeholder="Название склада" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isCentral} onChange={e => setF({ ...f, isCentral: e.target.checked })} />Центральный</label>
        </div>
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2" disabled={!f.name.trim() || !orgId}
          onClick={async () => { if (await onAdd({ ...f, orgId })) setF({ name: '', isCentral: false }) }}>Добавить склад</button>
      </Card>
      <div className="text-xs font-bold text-neutral-500 mb-2">СКЛАДЫ ({items.length})</div>
      <List head={['Название', 'Тип']}>
        {items.map(w => <tr key={w.id} className="border-t border-neutral-100"><td className="px-4 py-2 font-medium">{w.name}</td><td className="px-4 py-2 text-neutral-500">{w.isCentral ? 'Центральный' : '—'}</td></tr>)}
      </List>
    </>
  )
}

function CashAccounts({ items, orgId, onAdd }: { items: any[]; orgId: string; onAdd: (b: any) => Promise<boolean> }) {
  const [f, setF] = useState({ name: '', kind: 'cash' })
  return (
    <>
      <Card>
        <div className="text-xs font-bold text-neutral-500 mb-3">НОВАЯ КАССА / СЧЁТ</div>
        <div className="flex gap-2 items-center mb-2">
          <input className={`${inp} flex-1`} placeholder="Название" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <select className={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="cash">Касса</option><option value="bank">Банк</option></select>
        </div>
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2" disabled={!f.name.trim() || !orgId}
          onClick={async () => { if (await onAdd({ ...f, orgId })) setF({ name: '', kind: 'cash' }) }}>Добавить</button>
      </Card>
      <div className="text-xs font-bold text-neutral-500 mb-2">КАССЫ / СЧЕТА ({items.length})</div>
      <List head={['Название', 'Тип']}>
        {items.map(a => <tr key={a.id} className="border-t border-neutral-100"><td className="px-4 py-2 font-medium">{a.name}</td><td className="px-4 py-2 text-neutral-500">{a.kind === 'bank' ? 'Банк' : 'Касса'}</td></tr>)}
      </List>
    </>
  )
}
