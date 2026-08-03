'use client'
import { useEffect, useState } from 'react'

type CB = { id: string; name: string; kind: string; theyOwe: number; weOwe: number }
type Summary = { receivable: number; payable: number; cash: number; stockValue: number; contragents: CB[] }

const money = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸'

export default function FinancePage() {
  const [s, setS] = useState<Summary | null>(null)

  useEffect(() => {
    (async () => {
      const refs = await fetch('/api/refs').then(r => r.json())
      const org = refs.organizations[0]
      if (!org) return
      setS(await fetch(`/api/finance?orgId=${org.id}`).then(r => r.json()))
    })()
  }, [])

  if (!s) return <div className="p-8 text-neutral-500">Загрузка…</div>

  const tiles = [
    { label: 'Дебиторка (нам должны)', val: s.receivable, cls: 'text-emerald-600' },
    { label: 'Кредиторка (мы должны)', val: s.payable, cls: 'text-red-600' },
    { label: 'Касса / банк', val: s.cash, cls: 'text-blue-600' },
    { label: 'Товар на складе', val: s.stockValue, cls: 'text-neutral-800' },
  ]

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">💰 Финансы</h1>
      <p className="text-sm text-neutral-500 mb-5">Долги и остатки считаются на лету из документов и оплат.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {tiles.map(t => (
          <div key={t.label} className="bg-white rounded-2xl ring-1 ring-neutral-200 p-4">
            <div className="text-xs text-neutral-500 font-semibold mb-1">{t.label}</div>
            <div className={`text-lg font-extrabold tabular-nums ${t.cls}`}>{money(t.val)}</div>
          </div>
        ))}
      </div>

      <div className="text-xs font-bold text-neutral-500 mb-2">БАЛАНС ПО КОНТРАГЕНТАМ</div>
      <div className="bg-white rounded-2xl ring-1 ring-neutral-200 overflow-hidden">
        {s.contragents.length === 0
          ? <div className="p-6 text-center text-neutral-400 text-sm">Долгов нет</div>
          : <table className="w-full text-sm">
              <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">
                <th className="text-left px-4 py-2">Контрагент</th>
                <th className="text-right px-4 py-2">Нам должны</th>
                <th className="text-right px-4 py-2">Мы должны</th>
              </tr></thead>
              <tbody>{s.contragents.map(c => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700 font-semibold">{c.theyOwe > 0.001 ? money(c.theyOwe) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600 font-semibold">{c.weOwe > 0.001 ? money(c.weOwe) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>
    </main>
  )
}
