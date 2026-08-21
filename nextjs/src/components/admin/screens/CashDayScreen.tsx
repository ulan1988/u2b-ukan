'use client'
// Касса дня (десктоп-финанс): дневная сверка филиала — доходы по способам (нал/каспи/QR/долг),
// проверка «оплаты+долг=продано», счета за день, остаток KASPI GOLD + перевод в банк,
// расходы (ЗП/текущие через «Деньги»), производство в запас, закрытие смены. Орг — из селектора.
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { cashDay, cashExpense, cashTransferGold, cashCloseShift } from '@/lib/api/finmoney'

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const m = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU')

export default function CashDayScreen({ orgId }: { orgId: string }) {
  const [date, setDate] = useState(todayStr())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState('')
  const [exp, setExp] = useState({ kind: 'salary' as 'salary' | 'current', who: '', accountId: '', amount: '' })
  const [gold, setGold] = useState('')
  const toast = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 2200) }

  const load = useCallback(async () => { setLoading(true); setData(await cashDay(orgId, date)); setLoading(false) }, [orgId, date])
  useEffect(() => { load() }, [load])

  async function addExp() {
    const amount = Number((exp.amount || '').replace(',', '.')) || 0
    if (!exp.accountId || amount <= 0) { toast('Выберите счёт и сумму'); return }
    const r: any = await cashExpense(orgId, { kind: exp.kind, who: exp.who, accountId: exp.accountId, amount, date })
    if (r.ok) { toast(exp.kind === 'salary' ? '✓ ЗП добавлена' : '✓ Расход добавлен'); setExp(e => ({ ...e, who: '', amount: '' })); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function transfer() {
    const amount = Number((gold || '').replace(',', '.')) || 0
    if (amount <= 0) { toast('Укажите сумму'); return }
    const r: any = await cashTransferGold(orgId, amount, date)
    if (r.ok) { toast(`💳 Переведено в банк: ${m(amount)}`); setGold(''); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function close() {
    if (!confirm('Закрыть смену? Расходы будут проведены.')) return
    const r: any = await cashCloseShift(orgId, date)
    if (r.ok) { toast('✓ Смена закрыта'); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }

  const inc = data?.income || { cash: 0, kaspi: 0, qr: 0, debt: 0, total: 0 }
  const chk = data?.check || { ok: true, diff: 0 }
  const accts = data?.accounts || []
  const card: React.CSSProperties = { background: COLORS.white, borderRadius: 14, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: 16 }
  const kpi = (label: string, val: string, color: string) => (
    <div style={{ ...card, padding: '12px 14px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 12, color: COLORS.textLight, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{val}</div>
    </div>
  )

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: COLORS.dark, color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>💵 Касса дня</div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit' }} />
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>Обновить</button>
        {loading && <span style={{ color: COLORS.textMuted }}>Загрузка…</span>}
      </div>

      {!data ? <div style={{ ...card, textAlign: 'center', color: COLORS.textMuted }}>Нет данных</div> : <>
        {/* Доходы */}
        <div style={{ fontSize: 13, fontWeight: 800, color: '#2e8a5e', letterSpacing: '.04em', marginBottom: 8 }}>📥 ДОХОДЫ (продажи)</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {kpi('Наличка', m(inc.cash), '#2e8a5e')}{kpi('Каспи (GOLD)', m(inc.kaspi), '#2a5aaa')}{kpi('QR (банк)', m(inc.qr), '#2a5aaa')}{kpi('Долг', m(inc.debt), COLORS.primaryDark)}{kpi('Продано', m(inc.total), COLORS.text)}
        </div>
        {/* Проверка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: chk.ok ? '#e8f5ee' : '#faeaea', borderRadius: 10, padding: '10px 16px', marginBottom: 18, fontSize: 15 }}>
          <b style={{ color: chk.ok ? '#2e8a5e' : '#b03020', fontSize: 16 }}>{chk.ok ? '✅ Проверка: сходится' : `❌ Расхождение ${m(chk.diff)}`}</b>
          <span style={{ color: COLORS.textMuted, marginLeft: 'auto' }}>Нал + Каспи + QR + Долг = Продано · {(data.cards || []).length} продаж</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* Левая: счета + GOLD */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textSubtle, letterSpacing: '.04em', marginBottom: 10 }}>💰 СЧЕТА ЗА ДЕНЬ (продажи − расходы)</div>
              {accts.map((a: any) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${COLORS.borderLight}`, fontSize: 14 }}>
                  <span>{a.name}<span style={{ color: COLORS.textLight, fontSize: 12 }}>{a.fromSales ? ` · продажи ${m(a.fromSales)}` : ''}{a.fromFin ? ` · движ ${m(a.fromFin)}` : ''}</span></span>
                  <b style={{ color: a.net < 0 ? COLORS.primaryDark : COLORS.text }}>{m(a.net)} ₸</b>
                </div>
              ))}
            </div>
            <div style={{ ...card, background: '#fff8ef', boxShadow: '0 0 0 1.5px #f0d9b0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#8a6f00', letterSpacing: '.04em' }}>💳 НА МАСТЕРЕ (KASPI GOLD)</span>
                <b style={{ fontSize: 22, color: '#8a6f00', marginLeft: 'auto' }}>{m(data.goldBalance)} ₸</b>
              </div>
              <div style={{ fontSize: 12.5, color: '#9a8a5a', marginBottom: 10 }}>Собрано на личный Каспи мастера, ещё не переведено в банк.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={gold} inputMode="decimal" onChange={e => setGold(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="сумма перевода в банк" style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #f0d9b0', fontSize: 15, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <button onClick={transfer} style={{ border: 'none', background: '#b8860b', color: '#fff', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Перевести в банк →</button>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#7a3aaa', letterSpacing: '.04em', marginBottom: 10 }}>📦 ПРОИЗВОДСТВО В ЗАПАС</div>
              <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
                <div>Изделий: <b>{m(data.stock?.qty)}</b></div>
                <div>На сумму: <b>{m(data.stock?.amount)} ₸</b></div>
              </div>
            </div>
          </div>

          {/* Правая: расходы */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.primaryDark, letterSpacing: '.04em' }}>📤 РАСХОДЫ</div>
                <div style={{ marginLeft: 'auto', fontSize: 13, color: COLORS.textMuted }}>ЗП <b>{m(data.expenses?.salaryTotal)}</b> · текущие <b>{m(data.expenses?.currentTotal)}</b> · итого <b style={{ color: COLORS.primaryDark }}>{m(data.expenses?.total)}</b></div>
              </div>
              {(data.expenses?.rows || []).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {data.expenses.rows.map((r: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${COLORS.borderLight}`, fontSize: 13.5 }}>
                      <span>{r.article === 'ЗП' ? '👤 ЗП' : '🧾 ' + r.article}{r.who ? ` · ${r.who}` : ''}{r.status !== 'posted' ? ' (черновик)' : ''}</span>
                      <b style={{ color: COLORS.primaryDark }}>−{m(-r.amt)}</b>
                    </div>
                  ))}
                </div>
              )}
              {/* Добавить расход */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {(['salary', 'current'] as const).map(k => <button key={k} onClick={() => setExp(e => ({ ...e, kind: k }))} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: exp.kind === k ? COLORS.primary : COLORS.bg, color: exp.kind === k ? '#fff' : COLORS.textMuted }}>{k === 'salary' ? '👤 ЗП' : '🧾 Текущий'}</button>)}
              </div>
              <input value={exp.who} onChange={e => setExp(x => ({ ...x, who: e.target.value }))} placeholder={exp.kind === 'salary' ? 'Сотрудник (кому)' : 'Назначение расхода'} style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={exp.accountId} onChange={e => setExp(x => ({ ...x, accountId: e.target.value }))} style={{ flex: 1, padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff' }}>
                  <option value="">— счёт списания —</option>
                  {accts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input value={exp.amount} inputMode="decimal" onChange={e => setExp(x => ({ ...x, amount: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="сумма" style={{ width: 120, padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 15, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit' }} />
                <button onClick={addExp} style={{ border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>＋</button>
              </div>
            </div>
            <button onClick={close} disabled={!data.hasDraft} style={{ padding: '14px', borderRadius: 10, border: 'none', background: data.hasDraft ? COLORS.primary : COLORS.border, color: '#fff', cursor: data.hasDraft ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>{data.hasDraft ? '🔒 Закрыть смену (провести расходы)' : '✓ Расходы проведены'}</button>
          </div>
        </div>
      </>}
    </div>
  )
}
