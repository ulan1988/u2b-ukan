'use client'
// Финансы контрагента — выписка из /api/finance/client.
// Показывает долг, ВОЗВРАТЫ отдельной строкой (со знаком «−»), оплаты.
import { useState, useEffect } from 'react'

interface Txn { id: string; date: string; kind: string; label: string; number?: string; amount: number; sign: '+' | '-' }
interface FinData { debt: number; weOwe?: number; paid: number; balance: number; accrued?: number; returns?: number; currency: string; transactions: Txn[]; configured: boolean }
const fmtMoney = (n: number, cur = '₸') => `${(n || 0).toLocaleString('ru-RU')} ${cur}`
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('ru-RU') } catch { return s } }
const iconFor = (kind: string) => kind === 'payment' ? '⬆️' : kind.startsWith('return') ? '↩' : '🧾'

export default function FinanceView({ uid }: { uid?: string }) {
  const [data, setData] = useState<FinData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { let alive = true; fetch(`/api/finance/client${uid ? `?uid=${uid}` : ''}`).then(r => r.ok ? r.json() : null).then(d => { if (alive) setData(d) }).catch(() => {}).finally(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [uid])

  const cur = data?.currency || '₸'
  const debt = data?.debt || 0, paid = data?.paid || 0, returns = data?.returns || 0, weOwe = data?.weOwe || 0
  const tile = (label: string, value: string, color: string, bg: string) => (
    <div style={{ background: bg, borderRadius: 14, padding: '16px 14px', textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
  return (
    <div className="anim-fade">
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>💰 Финансы</div>
      <div style={{ color: '#5f5952', fontSize: 14, marginBottom: 16 }}>Ваш баланс по расчётам. Данные ведёт менеджер.</div>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {tile('ВЫ ДОЛЖНЫ', fmtMoney(debt, cur), '#c1121c', '#fff')}
            {tile('ВОЗВРАТЫ', fmtMoney(returns, cur), '#c0532a', returns > 0 ? '#fff8f5' : '#fff')}
            {tile('ОПЛАЧЕНО', fmtMoney(paid, cur), '#2e8a5e', '#fff')}
            {tile('МЫ ДОЛЖНЫ', fmtMoney(weOwe, cur), '#2e8a5e', weOwe > 0 ? '#f0f8f2' : '#fff')}
          </div>
          {returns > 0 && <div style={{ background: '#fff8f5', border: '1.5px solid #f3c8b0', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#c0532a' }}>↩ Возвраты на <b>{fmtMoney(returns, cur)}</b> уже вычтены из вашего долга.</div>}
          {!data?.configured && <div style={{ background: '#fdf8e1', border: '1.5px solid #f0d98a', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 14, color: '#8a6f00' }}>⏳ Финансовый учёт настраивается. Здесь появятся ваш долг, оплаты и остаток.</div>}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em', marginBottom: 8 }}>ОПЕРАЦИИ</div>
          {(!data || data.transactions.length === 0) ? <div style={{ background: '#fff', borderRadius: 12, padding: 28, textAlign: 'center', color: '#5f5952', fontSize: 14, boxShadow: '0 0 0 1px #e6e2dc' }}>Пока нет операций</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{data.transactions.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10, padding: '10px 14px', boxShadow: '0 0 0 1px #e6e2dc' }}>
                <span style={{ fontSize: 18 }}>{iconFor(t.kind)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}{t.number ? <span style={{ color: '#837c72', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}> · {t.number}</span> : null}</div>
                  <div style={{ fontSize: 12, color: '#5f5952' }}>{fmtDate(t.date)}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.sign === '-' ? '#2e8a5e' : '#c1121c' }}>{t.sign}{fmtMoney(t.amount, cur)}</div>
              </div>
            ))}</div>}
        </>
      )}
    </div>
  )
}
