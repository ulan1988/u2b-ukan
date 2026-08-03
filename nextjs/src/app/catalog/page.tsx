'use client'
import { useEffect, useState } from 'react'
import { PRODUCT_GROUPS, PRODUCT_CATEGORIES, CONTRAGENT_KINDS } from '@/lib/catalog'

type Tab = 'products' | 'contragents' | 'warehouses' | 'cash'
const TABS: { k: Tab; l: string }[] = [
  { k: 'products', l: '📦 Номенклатура' }, { k: 'contragents', l: '👥 Контрагенты' },
  { k: 'warehouses', l: '🏬 Склады' }, { k: 'cash', l: '💵 Кассы' },
]
const inp = 'border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500'
const catLabel = (v: string) => PRODUCT_CATEGORIES.find(c => c.value === v)?.label || v
const kindLabel = (v: string) => CONTRAGENT_KINDS.find(c => c.value === v)?.label || v

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>('products')
  const [orgId, setOrgId] = useState('')
  const [refs, setRefs] = useState<any>(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const r = await fetch('/api/refs').then(x => x.json())
    setRefs(r)
    if (r.organizations[0]) setOrgId(r.organizations[0].id)
  }
  useEffect(() => { load() }, [])

  async function post(url: string, body: any) {
    setMsg('')
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setMsg(data.error || 'Ошибка'); return false }
    setMsg('✅ Сохранено'); await load(); return true
  }

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

      {tab === 'products' && <Products products={refs.products} onAdd={b => post('/api/products', b)} />}
      {tab === 'contragents' && <Contragents items={refs.contragents} orgId={orgId} onAdd={b => post('/api/contragents', b)} />}
      {tab === 'warehouses' && <Warehouses items={refs.warehouses} orgId={orgId} onAdd={b => post('/api/warehouses', b)} />}
      {tab === 'cash' && <CashAccounts items={refs.cashAccounts} orgId={orgId} onAdd={b => post('/api/cash-accounts', b)} />}
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
        <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">{head.map(h => <th key={h} className="text-left px-4 py-2">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Products({ products, onAdd }: { products: any[]; onAdd: (b: any) => Promise<boolean> }) {
  const [f, setF] = useState({ name: '', unit: 'шт', category: 'goods', group: '', subgroup: '', priceIn: '', priceRetail: '', priceOpt: '' })
  return (
    <>
      <Card>
        <div className="text-xs font-bold text-neutral-500 mb-3">НОВЫЙ ТОВАР</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input className={`${inp} col-span-2`} placeholder="Наименование" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <select className={inp} value={f.group} onChange={e => setF({ ...f, group: e.target.value })}>
            <option value="">— группа —</option>{PRODUCT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className={inp} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {PRODUCT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input className={inp} placeholder="Ед. (шт/м2)" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} />
          <input className={inp} placeholder="Подгруппа (необяз.)" value={f.subgroup} onChange={e => setF({ ...f, subgroup: e.target.value })} />
          <input className={inp} type="number" placeholder="Цена приход" value={f.priceIn} onChange={e => setF({ ...f, priceIn: e.target.value })} />
          <input className={inp} type="number" placeholder="Цена розн." value={f.priceRetail} onChange={e => setF({ ...f, priceRetail: e.target.value })} />
          <input className={inp} type="number" placeholder="Цена опт" value={f.priceOpt} onChange={e => setF({ ...f, priceOpt: e.target.value })} />
        </div>
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2" disabled={!f.name.trim()}
          onClick={async () => { if (await onAdd(f)) setF({ name: '', unit: 'шт', category: 'goods', group: '', subgroup: '', priceIn: '', priceRetail: '', priceOpt: '' }) }}>Добавить товар</button>
      </Card>
      <div className="text-xs font-bold text-neutral-500 mb-2">ТОВАРЫ ({products.length})</div>
      <List head={['Наименование', 'Группа', 'Тип', 'Ед.', 'Приход', 'Розн.', 'Опт']}>
        {products.map(p => (
          <tr key={p.id} className="border-t border-neutral-100">
            <td className="px-4 py-2 font-medium">{p.name}</td>
            <td className="px-4 py-2 text-neutral-500">{p.group || '—'}</td>
            <td className="px-4 py-2 text-neutral-500">{catLabel(p.category)}</td>
            <td className="px-4 py-2 text-neutral-500">{p.unit}</td>
            <td className="px-4 py-2 tabular-nums">{Number(p.priceIn).toLocaleString('ru-RU')}</td>
            <td className="px-4 py-2 tabular-nums">{Number(p.priceRetail).toLocaleString('ru-RU')}</td>
            <td className="px-4 py-2 tabular-nums">{Number(p.priceOpt).toLocaleString('ru-RU')}</td>
          </tr>
        ))}
      </List>
    </>
  )
}

function Contragents({ items, orgId, onAdd }: { items: any[]; orgId: string; onAdd: (b: any) => Promise<boolean> }) {
  const [f, setF] = useState({ name: '', kind: 'client', priceType: 'retail', phone: '' })
  return (
    <>
      <Card>
        <div className="text-xs font-bold text-neutral-500 mb-3">НОВЫЙ КОНТРАГЕНТ</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input className={`${inp} col-span-2`} placeholder="Название" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <select className={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{CONTRAGENT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          <select className={inp} value={f.priceType} onChange={e => setF({ ...f, priceType: e.target.value })}><option value="retail">Розничная цена</option><option value="opt">Оптовая цена</option></select>
          <input className={`${inp} col-span-2`} placeholder="Телефон (необяз.)" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        </div>
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2" disabled={!f.name.trim() || !orgId}
          onClick={async () => { if (await onAdd({ ...f, orgId })) setF({ name: '', kind: 'client', priceType: 'retail', phone: '' }) }}>Добавить контрагента</button>
      </Card>
      <div className="text-xs font-bold text-neutral-500 mb-2">КОНТРАГЕНТЫ ({items.length})</div>
      <List head={['Название', 'Тип', 'Цена', 'Телефон']}>
        {items.map(c => (
          <tr key={c.id} className="border-t border-neutral-100">
            <td className="px-4 py-2 font-medium">{c.name}</td><td className="px-4 py-2 text-neutral-500">{kindLabel(c.kind)}</td>
            <td className="px-4 py-2 text-neutral-500">{c.priceType === 'opt' ? 'опт' : 'розн'}</td><td className="px-4 py-2 text-neutral-500">{c.phone || '—'}</td>
          </tr>
        ))}
      </List>
    </>
  )
}

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
