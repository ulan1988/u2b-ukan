'use client'
import { useEffect, useState } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'

// Бухгалтерия = проведённые заявки + встроенная ERP-Финансы (по решению пользователя).
export default function BookkeepingScreen({ orders, orgId, onAction, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onOpen?: (o: any) => void
}) {
  const [tab, setTab] = useState<'cards' | 'finance'>('cards')
  const [fin, setFin] = useState<any>(null)

  useEffect(() => {
    if (tab === 'finance' && !fin) fetch(`/api/finance?orgId=${orgId}`).then(r => r.json()).then(setFin).catch(() => {})
  }, [tab, fin, orgId])

  const cards = orders.filter(o => o.screen === 'bookkeeping')

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>Бухгалтерия</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([['cards', `Проведённые · ${cards.length}`], ['finance', 'Финансы']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : COLORS.textMuted, boxShadow: tab === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
      </div>

      {tab === 'cards' ? (
        cards.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted, fontSize: 14 }}>Нет проведённых карточек</div>
          : <div style={{ maxWidth: 640 }}>{cards.map(o => <OrderCard key={o.id} order={o} actions={o.isCancelled ? [] : [{ action: 'sendArchive', label: 'В архив', variant: 'primary' }]} onAction={onAction} onOpen={onOpen} />)}</div>
      ) : (
        <FinancePanel fin={fin} />
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmtMoney(value)} ₸</div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function FinancePanel({ fin }: { fin: any }) {
  if (!fin) return <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка финансов…</div>
  const cs = fin.contragents || []
  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Дебиторка (нам должны)" value={fin.receivable} color="#2e8a5e" />
        <KpiCard label="Кредиторка (мы должны)" value={fin.payable} color="#b03020" />
        <KpiCard label="Касса (приход−расход)" value={fin.cash} color={COLORS.primary} />
        <KpiCard label="Склад (стоимость)" value={fin.stockValue} color="#4a5aaa" />
      </div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>БАЛАНС ПО КОНТРАГЕНТАМ</div>
        {cs.length === 0 ? <div style={{ padding: 20, color: COLORS.textMuted, fontSize: 14 }}>Нет долгов</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Контрагент', 'Нам должны', 'Мы должны'].map(h => <th key={h} style={{ textAlign: h === 'Контрагент' ? 'left' : 'right', padding: '8px 16px' }}>{h}</th>)}</tr></thead>
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
