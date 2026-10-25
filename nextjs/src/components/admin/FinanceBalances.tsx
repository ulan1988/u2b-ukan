'use client'
// Баланс: дебиторка/кредиторка/касса/склад + долги по контрагентам. Живёт во вкладке «Финанс»
// (раньше был в «Бухгалтерии → Финансы»; «Бухгалтерия» — про движения/проводки).
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { finance } from '@/lib/api/finance'
import { useLiveData } from '@/lib/live'

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmtMoney(value)} ₸</div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

export default function FinanceBalances({ orgId }: { orgId: string }) {
  const [fin, setFin] = useState<any>(null)
  const load = () => finance(orgId).then(setFin)
  useEffect(() => { setFin(null); load() }, [orgId]) // eslint-disable-line
  useLiveData(load, [orgId])
  if (!fin) return <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка баланса…</div>
  const cs = fin.contragents || []
  return (
    <div className="anim-fade">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Дебиторка (нам должны)" value={fin.receivable} color="#2e8a5e" />
        <KpiCard label="Кредиторка (мы должны)" value={fin.payable} color="#b03020" />
        <KpiCard label="Касса (приход−расход)" value={fin.cash} color={COLORS.primary} />
        <KpiCard label="Склад (стоимость)" value={fin.stockValue} color="#4a5aaa" />
      </div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>БАЛАНС ПО КОНТРАГЕНТАМ</div>
        {cs.length === 0 ? <div style={{ padding: 20, color: COLORS.textMuted, fontSize: 14 }}>Нет долгов</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Контрагент', 'Нам должны', 'Мы должны'].map(h => <th key={h} style={{ textAlign: h === 'Контрагент' ? 'left' : 'right', padding: '8px 16px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>
              {cs.map((c: any) => (
                <tr key={c.id} style={{ borderTop: '1px solid #f1efec' }}>
                  <td style={{ padding: '8px 16px' }}>{c.name}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: c.theyOwe > 0.001 ? '#2e8a5e' : COLORS.textLight, fontWeight: 600 }}>{c.theyOwe > 0.001 ? `${fmtMoney(c.theyOwe)} ₸` : '—'}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: c.weOwe > 0.001 ? '#b03020' : COLORS.textLight, fontWeight: 600 }}>{c.weOwe > 0.001 ? `${fmtMoney(c.weOwe)} ₸` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
