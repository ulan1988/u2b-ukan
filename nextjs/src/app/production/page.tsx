'use client'
import { useEffect, useState } from 'react'
import { pickOrg, forOrg } from '@/lib/org'
import { fetchRefs } from '@/lib/api/refs'
import { listProduction, createProduction, cancelDocument } from '@/lib/api/docs'

type Ref = { id: string; name: string; orgId?: string; priceIn?: string; isCentral?: boolean }
type In = { productId: string; qty: string; price: string }
type Out = { productId: string; qty: string; lengthCm: string; widthCm: string; rate: string; price: string }
type Doc = { id: string; number: string; total: string; date: string; status: string }

const emptyIn = (): In => ({ productId: '', qty: '', price: '' })
const emptyOut = (): Out => ({ productId: '', qty: '', lengthCm: '', widthCm: '', rate: '', price: '' })
const num = (v: string) => Number(v) || 0
const outAmount = (o: Out) => {
  const area = num(o.lengthCm) && num(o.widthCm) ? (num(o.lengthCm) * num(o.widthCm)) / 10000 : 0
  return area && num(o.rate) ? area * num(o.rate) * num(o.qty) : num(o.qty) * num(o.price)
}

export default function ProductionPage() {
  const [refs, setRefs] = useState<any>(null)
  const [orgId, setOrgId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [inputs, setInputs] = useState<In[]>([emptyIn()])
  const [outputs, setOutputs] = useState<Out[]>([emptyOut()])
  const [docs, setDocs] = useState<Doc[]>([])
  const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false)

  async function load() {
    const r: any = await fetchRefs(); setRefs(r)
    const org = pickOrg<Ref>(r.organizations)
    if (org) { setOrgId(org.id); setDocs(await listProduction(org.id) as any) }
    const whs = forOrg<Ref>(r.warehouses, org?.id || '')
    const wh = whs.find(w => w.isCentral) || whs[0]; if (wh) setWarehouseId(wh.id)
  }
  useEffect(() => { load() }, [])

  const total = outputs.reduce((s, o) => s + outAmount(o), 0)
  const inp = 'border border-neutral-300 rounded-lg px-2 py-2 text-sm outline-none focus:border-purple-500'

  async function submit() {
    setMsg(''); setSaving(true)
    try {
      const body = {
        orgId, warehouseId,
        inputs: inputs.filter(i => i.productId && num(i.qty) > 0).map(i => ({ productId: i.productId, qty: num(i.qty), price: num(i.price) })),
        outputs: outputs.filter(o => o.productId && num(o.qty) > 0).map(o => ({ productId: o.productId, qty: num(o.qty), lengthCm: num(o.lengthCm) || undefined, widthCm: num(o.widthCm) || undefined, rate: num(o.rate) || undefined, price: num(o.price) || undefined })),
      }
      if (body.outputs.length === 0) { setMsg('Добавьте хотя бы один готовый товар'); setSaving(false); return }
      const r = await createProduction(body)
      if (!r.ok) { setMsg(r.error || 'Ошибка'); setSaving(false); return }
      setMsg(`✅ Производство ${r.data.number} на ${r.data.total.toLocaleString('ru-RU')} ₸`)
      setInputs([emptyIn()]); setOutputs([emptyOut()]); setDocs(await listProduction(orgId) as any)
    } catch (e: any) { setMsg(e.message) } finally { setSaving(false) }
  }
  async function cancel(id: string) {
    if (!confirm('Удалить производство? Склад откатится.')) return
    await cancelDocument(id)
    setDocs(await listProduction(orgId) as any)
  }

  if (!refs) return <div className="p-8 text-neutral-500">Загрузка…</div>
  const products: Ref[] = refs.products

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">🏭 Производство</h1>
      <p className="text-sm text-neutral-500 mb-4">Сырьё списывается со склада, готовый товар приходуется. Цена готового — по размерам: (см×см)/10000 = м² × ставка × кол-во.</p>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-neutral-200 p-5 mb-6">
        <label className="flex flex-col gap-1 text-sm mb-4 max-w-xs">Склад
          <select className={inp} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>{forOrg<Ref>(refs.warehouses, orgId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </label>

        {/* Сырьё */}
        <div className="text-xs font-bold text-neutral-500 mb-2">СЫРЬЁ / МАТЕРИАЛЫ (списывается)</div>
        <div className="flex flex-col gap-2 mb-1">
          {inputs.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className={`${inp} flex-1`} value={l.productId} onChange={e => setInputs(a => a.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}><option value="">— материал —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input className={`${inp} w-20 text-right`} type="number" placeholder="кол-во" value={l.qty} onChange={e => setInputs(a => a.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
              <input className={`${inp} w-24 text-right`} type="number" placeholder="цена" value={l.price} onChange={e => setInputs(a => a.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
              <button className="text-red-500 px-1" onClick={() => setInputs(a => a.length > 1 ? a.filter((_, j) => j !== i) : a)}>✕</button>
            </div>
          ))}
        </div>
        <button className="text-sm text-purple-600 font-semibold mb-4" onClick={() => setInputs(a => [...a, emptyIn()])}>＋ материал</button>

        {/* Готовый товар */}
        <div className="text-xs font-bold text-neutral-500 mb-2">ГОТОВЫЙ ТОВАР (приходуется, размерная цена)</div>
        <div className="flex flex-col gap-2 mb-1">
          {outputs.map((o, i) => (
            <div key={i} className="flex gap-1.5 items-center flex-wrap">
              <select className={`${inp} flex-1 min-w-[140px]`} value={o.productId} onChange={e => setOutputs(a => a.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}><option value="">— товар —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input className={`${inp} w-16 text-right`} type="number" placeholder="кол-во" value={o.qty} onChange={e => setOutputs(a => a.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
              <input className={`${inp} w-16 text-right`} type="number" placeholder="длина см" value={o.lengthCm} onChange={e => setOutputs(a => a.map((x, j) => j === i ? { ...x, lengthCm: e.target.value } : x))} />
              <input className={`${inp} w-16 text-right`} type="number" placeholder="шир. см" value={o.widthCm} onChange={e => setOutputs(a => a.map((x, j) => j === i ? { ...x, widthCm: e.target.value } : x))} />
              <input className={`${inp} w-20 text-right`} type="number" placeholder="ставка/м²" value={o.rate} onChange={e => setOutputs(a => a.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
              <input className={`${inp} w-20 text-right`} type="number" placeholder="или цена" value={o.price} onChange={e => setOutputs(a => a.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
              <span className="w-24 text-right text-sm font-semibold tabular-nums text-purple-700">{outAmount(o).toLocaleString('ru-RU')}</span>
              <button className="text-red-500 px-1" onClick={() => setOutputs(a => a.length > 1 ? a.filter((_, j) => j !== i) : a)}>✕</button>
            </div>
          ))}
        </div>
        <button className="text-sm text-purple-600 font-semibold" onClick={() => setOutputs(a => [...a, emptyOut()])}>＋ товар</button>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
          <div className="text-sm text-neutral-500">Выпуск на: <b className="text-neutral-900">{total.toLocaleString('ru-RU')} ₸</b></div>
          <button onClick={submit} disabled={saving} className="bg-purple-600 text-white font-bold text-sm rounded-lg px-5 py-2.5 disabled:opacity-60">{saving ? 'Сохранение…' : 'Провести производство →'}</button>
        </div>
        {msg && <div className="mt-3 text-sm">{msg}</div>}
      </div>

      <div className="text-xs font-bold text-neutral-500 mb-2">ПРОИЗВОДСТВО ({docs.length})</div>
      <div className="bg-white rounded-2xl ring-1 ring-neutral-200 overflow-hidden">
        {docs.length === 0 ? <div className="p-6 text-center text-neutral-400 text-sm">Пока нет</div>
          : <table className="w-full text-sm">
              <thead><tr className="bg-neutral-50 text-neutral-500 text-xs"><th className="text-left px-4 py-2">Номер</th><th className="text-left px-4 py-2">Дата</th><th className="text-right px-4 py-2">Выпуск</th><th className="text-left px-4 py-2"></th></tr></thead>
              <tbody>{docs.map(d => {
                const cancelled = d.status === 'cancelled'
                return (
                <tr key={d.id} className={`border-t border-neutral-100 ${cancelled ? 'opacity-50' : ''}`}>
                  <td className={`px-4 py-2 font-mono ${cancelled ? 'line-through text-neutral-400' : 'text-purple-600'}`}>{d.number}</td>
                  <td className="px-4 py-2 text-neutral-500">{d.date}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{Number(d.total).toLocaleString('ru-RU')} ₸</td>
                  <td className="px-4 py-2">{cancelled ? <span className="text-xs text-neutral-400">Удалён</span> : <button onClick={() => cancel(d.id)} className="text-xs text-red-600 hover:underline">🗑 Удалить</button>}</td>
                </tr>
              )})}</tbody>
            </table>}
      </div>
    </main>
  )
}
