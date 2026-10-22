'use client'
// Финансы контрагента — выписка из /api/finance/client.
// Показывает долг, ВОЗВРАТЫ отдельной строкой (со знаком «−»), оплаты.
// + Инкассация из кабинета: клиент выбирает счёт и сумму → приход нам, долг уменьшается.
import { useState, useEffect, useCallback } from 'react'

interface Txn { id: string; date: string; kind: string; label: string; number?: string; amount: number; sign: '+' | '-' }
interface PayAcc { id: string; name: string }
interface FinData { debt: number; weOwe?: number; paid: number; balance: number; accrued?: number; returns?: number; transitAgentDebt?: number; transitAgent?: string; currency: string; transactions: Txn[]; configured: boolean; payAccounts?: PayAcc[] }
const fmtMoney = (n: number, cur = '₸') => `${(n || 0).toLocaleString('ru-RU')} ${cur}`
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('ru-RU') } catch { return s } }
const iconFor = (kind: string) => kind === 'payment' ? '⬆️' : kind.startsWith('return') ? '↩' : '🧾'

export default function FinanceView({ uid }: { uid?: string }) {
  const [data, setData] = useState<FinData | null>(null)
  const [loading, setLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [payAcc, setPayAcc] = useState('')
  const [payAmt, setPayAmt] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    let alive = true
    fetch(`/api/finance/client${uid ? `?uid=${uid}` : ''}`).then(r => r.ok ? r.json() : null).then(d => { if (alive) setData(d) }).catch(() => {}).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [uid])
  useEffect(() => load(), [load])

  const payAccounts = data?.payAccounts || []
  const openPay = () => { setPayAcc(payAccounts[0]?.id || ''); setPayAmt(''); setMsg(''); setPayOpen(true) }
  const doPay = async () => {
    const amount = Number(String(payAmt).replace(/\s/g, '').replace(',', '.'))
    if (!payAcc) { setMsg('Выберите счёт'); return }
    if (!(amount > 0)) { setMsg('Введите сумму'); return }
    setSending(true); setMsg('')
    try {
      const r = await fetch(`/api/finance/client/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, accountId: payAcc, amount }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error || 'Ошибка'); setSending(false); return }
      setPayOpen(false); setSending(false); setLoading(true); load()
    } catch { setMsg('Ошибка сети'); setSending(false) }
  }

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
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${(data?.transitAgentDebt || 0) > 0 ? 5 : 4}, 1fr)`, gap: 10, marginBottom: 16 }}>
            {tile('ВЫ ДОЛЖНЫ', fmtMoney(debt, cur), '#c1121c', '#fff')}
            {tile('ВОЗВРАТЫ', fmtMoney(returns, cur), '#c0532a', returns > 0 ? '#fff8f5' : '#fff')}
            {tile('ОПЛАЧЕНО', fmtMoney(paid, cur), '#2e8a5e', '#fff')}
            {tile('МЫ ДОЛЖНЫ', fmtMoney(weOwe, cur), '#2e8a5e', weOwe > 0 ? '#f0f8f2' : '#fff')}
            {(data?.transitAgentDebt || 0) > 0 && tile(`ДОЛГ ${(data?.transitAgent || '').toUpperCase()}`.trim(), fmtMoney(data?.transitAgentDebt || 0, cur), '#c2570f', '#fff4ea')}
          </div>
          {payAccounts.length > 0 && (
            <button onClick={openPay} style={{ width: '100%', background: '#1f7a4d', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 16px', fontSize: 16, fontWeight: 700, marginBottom: 16, cursor: 'pointer' }}>
              🏦 Отправить оплату
            </button>
          )}
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

      {payOpen && (
        <div onClick={() => !sending && setPayOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 99999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 480, borderRadius: '18px 18px 0 0', padding: '18px 18px 24px', boxShadow: '0 -8px 30px rgba(0,0,0,.2)' }}>
            <div style={{ width: 40, height: 4, background: '#d8d3cc', borderRadius: 2, margin: '0 auto 14px' }} />
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>🏦 Отправить оплату</div>
            <div style={{ color: '#5f5952', fontSize: 13, marginBottom: 14 }}>Выберите счёт и введите сумму — оплата поступит нам, ваш долг уменьшится.</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>СЧЁТ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {payAccounts.map(a => (
                <button key={a.id} onClick={() => setPayAcc(a.id)} style={{ textAlign: 'left', padding: '13px 16px', borderRadius: 12, border: `2px solid ${payAcc === a.id ? '#1f7a4d' : '#e6e2dc'}`, background: payAcc === a.id ? '#f0f8f2' : '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  {payAcc === a.id ? '✅ ' : ''}{a.name}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>СУММА, {cur}</div>
            <input value={payAmt} onChange={e => setPayAmt(e.target.value)} inputMode="decimal" placeholder="0" autoFocus
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 22, fontWeight: 800, textAlign: 'center', borderRadius: 12, border: '2px solid #e6e2dc', marginBottom: 14 }} />
            {msg && <div style={{ color: '#c1121c', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{msg}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPayOpen(false)} disabled={sending} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1.5px solid #d8d3cc', background: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Отмена</button>
              <button onClick={doPay} disabled={sending} style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', background: '#1f7a4d', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', opacity: sending ? .6 : 1 }}>{sending ? 'Отправка…' : '💸 Отправить'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
