'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { profit } from '@/lib/api/finance'

// Закуп-отчёт = Рентабельность (наша ERP) + цепочка закуп→продажа (Ф4, позже).
export default function ProcurementScreen({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<'profit' | 'chain'>('profit')
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (tab === 'profit' && !data) profit(orgId).then(setData)
  }, [tab, data, orgId])

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>Закуп-отчёт</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([['profit', 'Рентабельность'], ['chain', 'Цепочка закуп→продажа']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : COLORS.textMuted, boxShadow: tab === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
      </div>

      {tab === 'chain' ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14, maxWidth: 640 }}>
          Цепочка закуп→продажа появится вместе с «Автозакупом» (следующий этап Ф4).
        </div>
      ) : !data ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div> : (
        <ProfitReport data={data} />
      )}
    </div>
  )
}

function ProfitReport({ data }: { data: any }) {
  const t = data.totals || { revenue: 0, cost: 0, profit: 0, margin: 0 }
  const sales = data.sales || []
  const kpi = [
    { l: 'Выручка', v: t.revenue, color: COLORS.text },
    { l: 'Себестоимость', v: t.cost, color: '#b03020' },
    { l: 'Прибыль', v: t.profit, color: '#2e8a5e' },
  ]
  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpi.map(k => (
          <div key={k.l} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{fmtMoney(k.v)} ₸</div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>{k.l}</div>
          </div>
        ))}
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.primary }}>{t.margin.toFixed(1)}%</div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>Маржа</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>ПО ПРОДАЖАМ</div>
        {sales.length === 0 ? <div style={{ padding: 20, color: COLORS.textMuted, fontSize: 14 }}>Нет продаж</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Документ', 'Клиент', 'Выручка', 'Себест.', 'Прибыль', 'Маржа'].map((h, i) => <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '8px 16px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {sales.map((s: any) => (
                  <tr key={s.id} style={{ borderTop: '1px solid #f1efec' }}>
                    <td style={{ padding: '8px 16px', fontWeight: 600 }}>{s.number}</td>
                    <td style={{ padding: '8px 16px' }}>{s.client}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtMoney(s.revenue)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: '#b03020' }}>{fmtMoney(s.cost)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: '#2e8a5e', fontWeight: 600 }}>{fmtMoney(s.profit)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>{s.margin.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
