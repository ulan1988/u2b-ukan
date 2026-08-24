'use client'
// Рентабельность по товару (кабинет мастера): за период выручка − себестоимость = прибыль, маржа %.
// Данные — finance.service.profitByProduct через GET /api/branch/profit.
import { useState, useEffect, useCallback } from 'react'
import { productProfit } from '@/lib/api/orders'

const m = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU')
const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function ProfitView({ uid }: { uid?: string }) {
  const [ym, setYm] = useState(monthNow())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const [y, mo] = ym.split('-').map(Number)
    const last = new Date(y, mo, 0).getDate()
    const from = `${ym}-01`, to = `${ym}-${String(last).padStart(2, '0')}`
    setData(await productProfit(from, to, uid)); setLoading(false)
  }, [ym, uid])
  useEffect(() => { load() }, [load])

  const t = data?.totals || { revenue: 0, cost: 0, profit: 0, margin: 0 }
  const items = (data?.items || []).slice().sort((a: any, b: any) => b.profit - a.profit)
  const tile = (label: string, val: string, color: string) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: '12px 10px', textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5f5952', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>{val}</div>
    </div>
  )
  return (
    <div className="anim-fade">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>📈 Рентабельность</div>
        <input type="month" value={ym} onChange={e => setYm(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontFamily: 'inherit' }} />
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка…</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
          {tile('Выручка', m(t.revenue) + ' ₸', '#26231f')}
          {tile('Себестоимость', m(t.cost) + ' ₸', '#c0532a')}
          {tile('Прибыль', m(t.profit) + ' ₸', t.profit >= 0 ? '#2e8a5e' : '#c1121c')}
          {tile('Маржа', (Math.round((t.margin || 0) * 10) / 10) + ' %', t.margin >= 0 ? '#2e8a5e' : '#c1121c')}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em', marginBottom: 8 }}>ПО ТОВАРАМ</div>
        {items.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 28, textAlign: 'center', color: '#5f5952', fontSize: 14, boxShadow: '0 0 0 1px #e6e2dc' }}>Продаж за период нет</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{items.map((it: any) => (
            <div key={it.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', boxShadow: '0 0 0 1px #e6e2dc' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                <b style={{ fontSize: 15, color: it.profit >= 0 ? '#2e8a5e' : '#c1121c', whiteSpace: 'nowrap' }}>{it.profit >= 0 ? '+' : ''}{m(it.profit)} ₸</b>
              </div>
              <div style={{ fontSize: 12, color: '#837c72', marginTop: 3 }}>{m(it.qty)} шт · выручка {m(it.revenue)} · себест {m(it.cost)} · маржа {Math.round((it.margin || 0) * 10) / 10}%</div>
            </div>
          ))}</div>}
      </>}
    </div>
  )
}
