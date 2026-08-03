'use client'
import { useEffect, useState } from 'react'

type Ref = { id: string; name: string; kind?: string }
type Pay = { id: string; contragentId: string; direction: string; amount: string; date: string; comment: string | null }

export default function PaymentsPage() {
  const [refs, setRefs] = useState<{ organizations: Ref[]; contragents: Ref[]; cashAccounts: Ref[] } | null>(null)
  const [orgId, setOrgId] = useState('')
  const [contragentId, setContragentId] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [cashAccountId, setCashAccountId] = useState('')
  const [comment, setComment] = useState('')
  const [list, setList] = useState<Pay[]>([])
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const r = await fetch('/api/refs').then(r => r.json())
    setRefs(r)
    const org = r.organizations[0]
    if (org) { setOrgId(org.id); setList(await fetch(`/api/payments?orgId=${org.id}`).then(x => x.json())) }
    if (r.contragents[0]) setContragentId(r.contragents[0].id)
    if (r.cashAccounts[0]) setCashAccountId(r.cashAccounts[0].id)
  }
  useEffect(() => { load() }, [])

  async function submit() {
    setMsg(''); setSaving(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, contragentId, direction, amount: Number(amount) || 0, cashAccountId, comment }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Ошибка'); setSaving(false); return }
      setMsg('✅ Оплата проведена')
      setAmount(''); setComment('')
      setList(await fetch(`/api/payments?orgId=${orgId}`).then(x => x.json()))
    } catch (e: any) { setMsg(e.message) }
    finally { setSaving(false) }
  }

  const cname = (id: string) => refs?.contragents.find(c => c.id === id)?.name || '—'
  const inp = 'border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500'
  if (!refs) return <div className="p-8 text-neutral-500">Загрузка…</div>

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">💵 Оплаты</h1>
      <p className="text-sm text-neutral-500 mb-5">Приход денег от клиента (гасит его долг) или оплата поставщику (гасит наш).</p>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-neutral-200 p-5 mb-6">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setDirection('in')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${direction === 'in' ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}>← Приход (от клиента)</button>
          <button onClick={() => setDirection('out')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${direction === 'out' ? 'bg-red-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}>Оплата поставщику →</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">Контрагент
            <select className={inp} value={contragentId} onChange={e => setContragentId(e.target.value)}>
              {refs.contragents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Касса / банк
            <select className={inp} value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}>
              {refs.cashAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Сумма
            <input className={inp} type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Комментарий
            <input className={inp} value={comment} onChange={e => setComment(e.target.value)} placeholder="—" />
          </label>
        </div>
        <div className="flex items-center justify-end mt-4">
          <button onClick={submit} disabled={saving || !(Number(amount) > 0)} className="bg-blue-600 text-white font-bold text-sm rounded-lg px-5 py-2.5 disabled:opacity-60">
            {saving ? 'Сохранение…' : 'Провести оплату →'}
          </button>
        </div>
        {msg && <div className="mt-3 text-sm">{msg}</div>}
      </div>

      <div className="text-xs font-bold text-neutral-500 mb-2">ОПЛАТЫ ({list.length})</div>
      <div className="bg-white rounded-2xl ring-1 ring-neutral-200 overflow-hidden">
        {list.length === 0
          ? <div className="p-6 text-center text-neutral-400 text-sm">Пока нет оплат</div>
          : <table className="w-full text-sm">
              <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">
                <th className="text-left px-4 py-2">Дата</th><th className="text-left px-4 py-2">Контрагент</th>
                <th className="text-left px-4 py-2">Тип</th><th className="text-right px-4 py-2">Сумма</th>
              </tr></thead>
              <tbody>{list.map(p => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-500">{p.date}</td>
                  <td className="px-4 py-2">{cname(p.contragentId)}</td>
                  <td className="px-4 py-2">{p.direction === 'in' ? <span className="text-emerald-700">← приход</span> : <span className="text-red-600">оплата →</span>}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{Number(p.amount).toLocaleString('ru-RU')} ₸</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>
    </main>
  )
}
