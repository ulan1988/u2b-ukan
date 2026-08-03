'use client'
import { useEffect, useState } from 'react'

type Sale = { id: string; number: string; date: string; client: string; revenue: number; cost: number; profit: number; margin: number }
type Data = { sales: Sale[]; totals: { revenue: number; cost: number; profit: number; margin: number } }

const money = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸'
const pct = (n: number) => n.toFixed(1) + '%'

export default function ProfitPage() {
  const [d, setD] = useState<Data | null>(null)

  useEffect(() => {
    (async () => {
      const refs = await fetch('/api/refs').then(r => r.json())
      const org = refs.organizations[0]
      if (!org) return
      setD(await fetch(`/api/profit?orgId=${org.id}`).then(r => r.json()))
    })()
  }, [])

  if (!d) return <div className="p-8 text-neutral-500">Загрузка…</div>
  const t = d.totals

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">📈 Рентабельность</h1>
      <p className="text-sm text-neutral-500 mb-5">Выручка − себестоимость = прибыль. Себестоимость берётся из связанных партий закупа (FIFO), как в 1С.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl ring-1 ring-neutral-200 p-4"><div className="text-xs text-neutral-500 font-semibold mb-1">Выручка</div><div className="text-lg font-extrabold tabular-nums">{money(t.revenue)}</div></div>
        <div className="bg-white rounded-2xl ring-1 ring-neutral-200 p-4"><div className="text-xs text-neutral-500 font-semibold mb-1">Себестоимость</div><div className="text-lg font-extrabold tabular-nums text-neutral-700">{money(t.cost)}</div></div>
        <div className="bg-white rounded-2xl ring-1 ring-neutral-200 p-4"><div className="text-xs text-neutral-500 font-semibold mb-1">Прибыль</div><div className={`text-lg font-extrabold tabular-nums ${t.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(t.profit)}</div></div>
        <div className="bg-white rounded-2xl ring-1 ring-neutral-200 p-4"><div className="text-xs text-neutral-500 font-semibold mb-1">Маржа</div><div className={`text-lg font-extrabold tabular-nums ${t.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pct(t.margin)}</div></div>
      </div>

      <div className="text-xs font-bold text-neutral-500 mb-2">ПО ПРОДАЖАМ ({d.sales.length})</div>
      <div className="bg-white rounded-2xl ring-1 ring-neutral-200 overflow-hidden overflow-x-auto">
        {d.sales.length === 0
          ? <div className="p-6 text-center text-neutral-400 text-sm">Продаж нет</div>
          : <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">
                <th className="text-left px-4 py-2">Номер</th><th className="text-left px-4 py-2">Заказчик</th><th className="text-left px-4 py-2">Дата</th>
                <th className="text-right px-4 py-2">Выручка</th><th className="text-right px-4 py-2">Себест.</th><th className="text-right px-4 py-2">Прибыль</th><th className="text-right px-4 py-2">Маржа</th>
              </tr></thead>
              <tbody>{d.sales.map(s => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-mono text-emerald-600">{s.number}</td>
                  <td className="px-4 py-2">{s.client}</td>
                  <td className="px-4 py-2 text-neutral-500">{s.date}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(s.revenue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{money(s.cost)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${s.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{money(s.profit)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${s.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{pct(s.margin)}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>
    </main>
  )
}
