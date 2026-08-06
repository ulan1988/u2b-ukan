'use client'
// Финансы клиента — портирован из Улкана 1:1. Данные из /api/finance/client.
import { useState, useEffect } from 'react'

interface Txn { id: string; date: string; type: 'debt' | 'payment'; amount: number; comment?: string }
interface FinData { debt: number; paid: number; balance: number; currency: string; transactions: Txn[]; configured: boolean }
const fmtMoney = (n: number, cur = '₸') => `${(n || 0).toLocaleString('ru-RU')} ${cur}`
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('ru-RU') } catch { return s } }

export default function FinanceView() {
  const [data, setData] = useState<FinData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { let alive = true; fetch('/api/finance/client').then(r => r.ok ? r.json() : null).then(d => { if (alive) setData(d) }).catch(() => {}).finally(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [])

  const cur = data?.currency || '₸'
  const debt = data?.debt || 0, paid = data?.paid || 0, balance = data ? data.balance : 0
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {tile('ДОЛГ', fmtMoney(debt, cur), '#c1121c', '#fff')}
            {tile('ОПЛАЧЕНО', fmtMoney(paid, cur), '#2e8a5e', '#fff')}
            {tile('ОСТАТОК', fmtMoney(Math.abs(balance), cur), balance > 0 ? '#c0532a' : '#2e8a5e', balance > 0 ? '#fff8f5' : '#f0f8f2')}
          </div>
          {balance !== 0 && <div style={{ fontSize: 13, color: '#5f5952', textAlign: 'center', marginBottom: 16 }}>{balance > 0 ? 'Сумма к оплате' : 'Переплата (аванс)'}</div>}
          {!data?.configured && <div style={{ background: '#fdf8e1', border: '1.5px solid #f0d98a', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 14, color: '#8a6f00' }}>⏳ Финансовый учёт настраивается. Здесь появятся ваш долг, оплаты и остаток.</div>}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em', marginBottom: 8 }}>ОПЕРАЦИИ</div>
          {(!data || data.transactions.length === 0) ? <div style={{ background: '#fff', borderRadius: 12, padding: 28, textAlign: 'center', color: '#5f5952', fontSize: 14, boxShadow: '0 0 0 1px #e6e2dc' }}>Пока нет операций</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{data.transactions.map(t => <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10, padding: '10px 14px', boxShadow: '0 0 0 1px #e6e2dc' }}><span style={{ fontSize: 18 }}>{t.type === 'payment' ? '⬆️' : '🧾'}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{t.type === 'payment' ? 'Оплата' : 'Начисление'}</div><div style={{ fontSize: 12, color: '#5f5952' }}>{fmtDate(t.date)}{t.comment ? ` · ${t.comment}` : ''}</div></div><div style={{ fontSize: 14, fontWeight: 700, color: t.type === 'payment' ? '#2e8a5e' : '#c1121c' }}>{t.type === 'payment' ? '−' : '+'}{fmtMoney(t.amount, cur)}</div></div>)}</div>}
        </>
      )}
    </div>
  )
}
