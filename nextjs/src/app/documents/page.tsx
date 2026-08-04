'use client'
import { useEffect, useState } from 'react'
import { pickOrg, forOrg } from '@/lib/org'
import { fetchRefs } from '@/lib/api/refs'
import { listPurchases, createPurchase, cancelDocument } from '@/lib/api/docs'

type Ref = { id: string; name: string; orgId?: string; priceIn?: string; isCentral?: boolean }
type Refs = { organizations: Ref[]; suppliers: Ref[]; warehouses: Ref[]; products: Ref[] }
type Line = { productId: string; qty: string; price: string }
type Doc = { id: string; number: string; contragentId: string | null; total: string; date: string; status: string }

const emptyLine = (): Line => ({ productId: '', qty: '', price: '' })

export default function DocumentsPage() {
  const [refs, setRefs] = useState<Refs | null>(null)
  const [orgId, setOrgId] = useState('')
  const [contragentId, setContragentId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [docs, setDocs] = useState<Doc[]>([])
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadRefs() {
    const r: any = await fetchRefs()
    setRefs(r)
    const org = pickOrg<Ref>(r.organizations)
    if (org) { setOrgId(org.id); loadDocs(org.id) }
    const whs = forOrg<Ref>(r.warehouses, org?.id || '')
    const wh = whs.find(w => w.isCentral) || whs[0]
    if (wh) setWarehouseId(wh.id)
    const sups = forOrg<Ref>(r.suppliers, org?.id || '')
    if (sups[0]) setContragentId(sups[0].id)
  }
  async function loadDocs(id: string) {
    setDocs(await listPurchases(id) as any)
  }
  useEffect(() => { loadRefs() }, [])

  function setLine(i: number, patch: Partial<Line>) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  function onProduct(i: number, productId: string) {
    const p = refs?.products.find(x => x.id === productId)
    setLine(i, { productId, price: lines[i].price || p?.priceIn || '' })
  }

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)

  async function submit() {
    setMsg(''); setSaving(true)
    try {
      const body = {
        orgId, contragentId, warehouseId,
        lines: lines.filter(l => l.productId && Number(l.qty) > 0).map(l => ({ productId: l.productId, qty: Number(l.qty), price: Number(l.price) || 0 })),
      }
      if (body.lines.length === 0) { setMsg('Добавьте хотя бы одну позицию'); setSaving(false); return }
      const r = await createPurchase(body)
      if (!r.ok) { setMsg(r.error || 'Ошибка'); setSaving(false); return }
      setMsg(`✅ Приход ${r.data.number} создан на ${r.data.total.toLocaleString('ru-RU')} ₸`)
      setLines([emptyLine()])
      loadDocs(orgId)
    } catch (e: any) { setMsg(e.message) }
    finally { setSaving(false) }
  }

  async function cancel(id: string) {
    if (!confirm('Отменить приход? Склад и долг поставщику откатятся.')) return
    await cancelDocument(id)
    loadDocs(orgId)
  }
  const supName = (id: string | null) => refs?.suppliers.find(s => s.id === id)?.name || '—'
  const inp = 'border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500'

  if (!refs) return <div className="p-8 text-neutral-500">Загрузка…</div>

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">📥 Приход (закуп)</h1>
      <p className="text-sm text-neutral-500 mb-5">Приходная накладная от поставщика на склад. Долг перед поставщиком и остаток склада считаются автоматически.</p>

      {/* Форма */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-neutral-200 p-5 mb-6">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="flex flex-col gap-1 text-sm">Поставщик
            <select className={inp} value={contragentId} onChange={e => setContragentId(e.target.value)}>
              {forOrg<Ref>(refs.suppliers, orgId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Склад
            <select className={inp} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              {forOrg<Ref>(refs.warehouses, orgId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
        </div>

        <div className="text-xs font-bold text-neutral-500 mb-2">ПОЗИЦИИ</div>
        <div className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className={`${inp} flex-1`} value={l.productId} onChange={e => onProduct(i, e.target.value)}>
                <option value="">— товар —</option>
                {refs.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input className={`${inp} w-20 text-right`} type="number" placeholder="кол-во" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} />
              <input className={`${inp} w-24 text-right`} type="number" placeholder="цена" value={l.price} onChange={e => setLine(i, { price: e.target.value })} />
              <span className="w-24 text-right text-sm font-semibold tabular-nums">{((Number(l.qty) || 0) * (Number(l.price) || 0)).toLocaleString('ru-RU')}</span>
              <button className="text-red-500 px-1" onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)}>✕</button>
            </div>
          ))}
        </div>
        <button className="mt-2 text-sm text-orange-600 font-semibold" onClick={() => setLines(ls => [...ls, emptyLine()])}>＋ позиция</button>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
          <div className="text-sm text-neutral-500">Итого прихода: <b className="text-neutral-900">{total.toLocaleString('ru-RU')} ₸</b></div>
          <button onClick={submit} disabled={saving} className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2.5 disabled:opacity-60">
            {saving ? 'Сохранение…' : 'Провести приход →'}
          </button>
        </div>
        {msg && <div className="mt-3 text-sm">{msg}</div>}
      </div>

      {/* Список */}
      <div className="text-xs font-bold text-neutral-500 mb-2">ПРИХОДНЫЕ НАКЛАДНЫЕ ({docs.length})</div>
      <div className="bg-white rounded-2xl ring-1 ring-neutral-200 overflow-hidden">
        {docs.length === 0
          ? <div className="p-6 text-center text-neutral-400 text-sm">Пока нет приходов</div>
          : <table className="w-full text-sm">
              <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">
                <th className="text-left px-4 py-2">Номер</th><th className="text-left px-4 py-2">Поставщик</th>
                <th className="text-left px-4 py-2">Дата</th><th className="text-right px-4 py-2">Сумма</th><th className="text-left px-4 py-2">Статус</th>
              </tr></thead>
              <tbody>{docs.map(d => {
                const cancelled = d.status === 'cancelled'
                return (
                <tr key={d.id} className={`border-t border-neutral-100 ${cancelled ? 'opacity-50' : ''}`}>
                  <td className={`px-4 py-2 font-mono ${cancelled ? 'line-through text-neutral-400' : 'text-orange-600'}`}>{d.number}</td>
                  <td className="px-4 py-2">{supName(d.contragentId)}</td>
                  <td className="px-4 py-2 text-neutral-500">{d.date}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{Number(d.total).toLocaleString('ru-RU')} ₸</td>
                  <td className="px-4 py-2">
                    {cancelled
                      ? <span className="text-xs bg-neutral-100 text-neutral-500 rounded-full px-2 py-0.5">Удалён</span>
                      : <button onClick={() => cancel(d.id)} className="text-xs text-red-600 hover:underline">🗑 Удалить</button>}
                  </td>
                </tr>
              )})}</tbody>
            </table>}
      </div>
    </main>
  )
}
