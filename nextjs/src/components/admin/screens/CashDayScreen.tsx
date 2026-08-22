'use client'
// Касса дня (десктоп-финанс): дневная сверка филиала — доходы по способам (нал/каспи/QR/долг),
// проверка «оплаты+долг=продано», счета за день, остаток KASPI GOLD + перевод в банк,
// расходы (ЗП/текущие через «Деньги»), производство в запас, закрытие смены. Орг — из селектора.
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { cashDay, cashExpense, cashIncassate, cashRemit, cashWages, cashCloseShift, cashMonth } from '@/lib/api/finmoney'

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const m = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU')

export default function CashDayScreen({ orgId }: { orgId: string }) {
  const [view, setView] = useState<'day' | 'month'>('day')
  const [date, setDate] = useState(todayStr())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState('')
  const [cur, setCur] = useState({ articleId: '', who: '', accountId: '', amount: '' })   // текущий расход
  const [wageAcc, setWageAcc] = useState('')                    // счёт списания ЗП
  const [wages, setWages] = useState<Record<string, string>>({})   // ЗП по сотрудникам
  const [incas, setIncas] = useState({ cash: '', kaspi: '' })   // инкассация мастер→филиал
  const [remit, setRemit] = useState('')                        // сдать головному
  const [ym, setYm] = useState(() => todayStr().slice(0, 7))
  const [month, setMonth] = useState<any>(null)
  const toast = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 2200) }

  const load = useCallback(async () => { setLoading(true); const d = await cashDay(orgId, date); setData(d); setWageAcc(prev => prev || (d?.accounts || []).find((a: any) => a.name === 'Основная касса')?.id || (d?.accounts || [])[0]?.id || ''); setLoading(false) }, [orgId, date])
  useEffect(() => { if (view === 'day') load() }, [load, view])
  const loadMonth = useCallback(async () => {
    setLoading(true)
    const [y, mo] = ym.split('-').map(Number); const last = new Date(y, mo, 0).getDate()
    setMonth(await cashMonth(orgId, `${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`)); setLoading(false)
  }, [orgId, ym])
  useEffect(() => { if (view === 'month') loadMonth() }, [loadMonth, view])

  async function addCurrent() {
    const amount = Number((cur.amount || '').replace(',', '.')) || 0
    if (!cur.accountId || amount <= 0) { toast('Выберите счёт и сумму'); return }
    const art = (data?.expenseArticles || []).find((a: any) => a.id === cur.articleId)
    const article = art ? art.name : 'Текущий расход'
    const r: any = await cashExpense(orgId, { kind: 'current', who: cur.who, article, expenseArticleId: cur.articleId || undefined, accountId: cur.accountId, amount, date })
    if (r.ok) { toast('✓ Расход добавлен'); setCur({ articleId: '', who: '', accountId: '', amount: '' }); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function payAllWages() {
    const acc = wageAcc || (data?.accounts || []).find((a: any) => a.name === 'Основная касса')?.id || (data?.accounts || [])[0]?.id
    if (!acc) { toast('Нет счёта'); return }
    const items = (data?.staff || []).map((u: any) => ({ who: u.name, amount: Number((wages[u.id] || '').replace(',', '.')) || 0 })).filter((i: any) => i.amount > 0)
    if (!items.length) { toast('Укажите суммы ЗП'); return }
    const r: any = await cashWages(orgId, acc, items, date)
    if (r.ok) { toast(`✓ ЗП оплачена: ${items.length} чел · ${m(r.total)}`); setWages({}); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function doIncassate() {
    const cash = Number((incas.cash || '').replace(',', '.')) || 0, kaspi = Number((incas.kaspi || '').replace(',', '.')) || 0
    if (cash + kaspi <= 0) { toast('Укажите сумму инкассации'); return }
    const r: any = await cashIncassate(orgId, cash, kaspi, date)
    if (r.ok) { toast(`💼 Инкассировано в филиал: ${m(cash + kaspi)}`); setIncas({ cash: '', kaspi: '' }); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function doRemit() {
    const amount = Number((remit || '').replace(',', '.')) || 0
    if (amount <= 0) { toast('Укажите сумму'); return }
    const r: any = await cashRemit(orgId, amount, date)
    if (r.ok) { toast(`🏢 Сдано головному: ${m(amount)}`); setRemit(''); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>💵 Касса</div>
        <div style={{ display: 'flex', gap: 4, background: COLORS.bg, borderRadius: 9, padding: 3 }}>
          {(['day', 'month'] as const).map(v => <button key={v} onClick={() => setView(v)} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: view === v ? COLORS.white : 'transparent', color: view === v ? COLORS.primary : COLORS.textMuted, boxShadow: view === v ? `0 0 0 1px ${COLORS.border}` : 'none' }}>{v === 'day' ? 'День' : 'Месяц'}</button>)}
        </div>
        {view === 'day'
          ? <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit' }} />
          : <input type="month" value={ym} onChange={e => setYm(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit' }} />}
        <button onClick={() => view === 'day' ? load() : loadMonth()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>Обновить</button>
        {loading && <span style={{ color: COLORS.textMuted }}>Загрузка…</span>}
      </div>

      {view === 'month' ? (!month ? <div style={{ ...card, textAlign: 'center', color: COLORS.textMuted }}>Нет данных</div> : (() => {
        const t = month.totals || {}
        const cell: React.CSSProperties = { padding: '7px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }
        const th: React.CSSProperties = { ...cell, fontWeight: 700, color: COLORS.textLight, fontSize: 12, borderBottom: `1.5px solid ${COLORS.border}` }
        return <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>Дата</th><th style={th}>Наличка</th><th style={th}>Каспи</th><th style={th}>QR</th><th style={th}>Долг</th><th style={th}>Продано</th><th style={{ ...th, textAlign: 'center' }}>✓</th><th style={th}>ЗП</th><th style={th}>Расход</th>
            </tr></thead>
            <tbody>
              {(month.days || []).map((d: any) => <tr key={d.day} style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{d.day.slice(8)}.{d.day.slice(5, 7)}</td>
                <td style={cell}>{m(d.cash)}</td><td style={cell}>{m(d.kaspi)}</td><td style={cell}>{m(d.qr)}</td>
                <td style={{ ...cell, color: COLORS.primaryDark }}>{m(d.debt)}</td><td style={{ ...cell, fontWeight: 700 }}>{m(d.sold)}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{d.ok ? '✅' : '❌'}</td>
                <td style={cell}>{d.salary ? m(d.salary) : '—'}</td><td style={cell}>{d.current ? m(d.current) : '—'}</td>
              </tr>)}
              {(month.days || []).length === 0 && <tr><td colSpan={9} style={{ ...cell, textAlign: 'center', color: COLORS.textMuted, padding: 24 }}>Продаж за месяц нет</td></tr>}
            </tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${COLORS.border}`, background: COLORS.bgCard }}>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>ИТОГО ({t.cnt || 0})</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.cash)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.kaspi)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.qr)}</td>
              <td style={{ ...cell, fontWeight: 800, color: COLORS.primaryDark }}>{m(t.debt)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.sold)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{month.ok ? '✅' : '❌'}</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.salary)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.current)}</td>
            </tr></tfoot>
          </table>
        </div>
      })()) : !data ? <div style={{ ...card, textAlign: 'center', color: COLORS.textMuted }}>Нет данных</div> : <>
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
            {/* Инкассация: деньги проходят 3 уровня — у мастера → у филиала → у головного (закрывает долг) */}
            <div style={{ ...card, background: '#fff8ef', boxShadow: '0 0 0 1.5px #f0d9b0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#8a6f00', letterSpacing: '.04em', marginBottom: 10 }}>💼 ИНКАССАЦИЯ</div>
              {(() => { const L = data.levels || {}; return <>
                {/* Уровень 1: у мастера */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: `0 0 0 1px ${COLORS.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#8a6f00' }}>💰 У мастера</span>
                    <span style={{ fontSize: 12, color: COLORS.textLight }}>Наличка {m(L.masterCash)} · GOLD {m(L.masterGold)}</span>
                    <b style={{ fontSize: 16, marginLeft: 'auto', color: '#8a6f00' }}>{m(L.master)} ₸</b>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input value={incas.cash} inputMode="decimal" onChange={e => setIncas(x => ({ ...x, cash: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="нал" style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <input value={incas.kaspi} inputMode="decimal" onChange={e => setIncas(x => ({ ...x, kaspi: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="каспи (GOLD)" style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <button onClick={doIncassate} style={{ border: 'none', background: '#b8860b', color: '#fff', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Инкассировать ↓</button>
                  </div>
                </div>
                {/* Уровень 2: у филиала */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: `0 0 0 1px ${COLORS.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2a5aaa' }}>🏭 У филиала (Банковский счёт)</span>
                    <b style={{ fontSize: 16, marginLeft: 'auto', color: '#2a5aaa' }}>{m(L.branch)} ₸</b>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input value={remit} inputMode="decimal" onChange={e => setRemit(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="сумма головному" style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <button onClick={doRemit} style={{ border: 'none', background: '#2a5aaa', color: '#fff', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Сдать головному ↓</button>
                  </div>
                </div>
                {/* Уровень 3: у головного + долг */}
                <div style={{ background: '#eef7f1', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2e8a5e' }}>🏢 Отдано головному</span>
                    <b style={{ fontSize: 16, marginLeft: 'auto', color: '#2e8a5e' }}>{m(L.hq)} ₸</b>
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.primaryDark, marginTop: 6, fontWeight: 700 }}>Долг перед головным: {m(L.debtHQ)} ₸</div>
                </div>
              </> })()}
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
              {/* ЗП — списком сотрудников, разом */}
              <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>👤 ЗП — оплатить списком</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.textMuted }}>со счёта</span>
                  <select value={wageAcc} onChange={e => setWageAcc(e.target.value)} style={{ padding: '6px 8px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                    {accts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                {(data.staff || []).length === 0 ? <div style={{ fontSize: 13, color: COLORS.textMuted, padding: '6px 0' }}>Нет сотрудников</div>
                  : (data.staff || []).map((u: any) => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
                      <span style={{ flex: 1, fontSize: 13.5 }}>{u.name}{u.position ? <span style={{ color: COLORS.textLight, fontSize: 12 }}> · {u.position}</span> : ''}</span>
                      {Number(u.dailyWage) > 0 && <button onClick={() => setWages(w => ({ ...w, [u.id]: String(Math.round(Number(u.dailyWage))) }))} title="подставить оклад" style={{ border: 'none', background: COLORS.bg, color: COLORS.textMuted, borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{m(u.dailyWage)}</button>}
                      <input value={wages[u.id] || ''} inputMode="decimal" onChange={e => setWages(w => ({ ...w, [u.id]: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder={Number(u.dailyWage) > 0 ? m(u.dailyWage) : '0'} style={{ width: 120, padding: '7px 9px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit' }} />
                    </div>
                  ))}
                {(() => { const tot = (data.staff || []).reduce((s: number, u: any) => s + (Number((wages[u.id] || '').replace(',', '.')) || 0), 0); return <button onClick={payAllWages} disabled={!(tot > 0)} style={{ marginTop: 10, width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: tot > 0 ? '#2e8a5e' : COLORS.border, color: '#fff', cursor: tot > 0 ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{`💵 Оплатить ЗП${tot > 0 ? ' · ' + m(tot) : ''}`}</button> })()}
              </div>
              {/* Текущий расход — по статье (как в 1С) */}
              <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>🧾 Текущий расход</div>
                <select value={cur.articleId} onChange={e => setCur(x => ({ ...x, articleId: e.target.value }))} style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', marginBottom: 8 }}>
                  <option value="">— статья ДДС —</option>
                  {(() => { const ACT: any = { operating: 'Операционная', transfer: 'Перемещения', financial: 'Финансовая', investing: 'Инвестиционная' }; return Object.entries((data.expenseArticles || []).reduce((g: any, a: any) => { const k = ACT[a.activity] || a.activity || 'Прочее'; (g[k] = g[k] || []).push(a); return g }, {})).map(([grp, arts]: any) => <optgroup key={grp} label={grp}>{arts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>) })()}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={cur.who} onChange={e => setCur(x => ({ ...x, who: e.target.value }))} placeholder="комментарий (необязательно)" style={{ flex: 1, padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <select value={cur.accountId} onChange={e => setCur(x => ({ ...x, accountId: e.target.value }))} style={{ width: 150, padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff' }}>
                    <option value="">— счёт —</option>{accts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <input value={cur.amount} inputMode="decimal" onChange={e => setCur(x => ({ ...x, amount: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="сумма" style={{ width: 110, padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 15, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit' }} />
                  <button onClick={addCurrent} style={{ border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>＋</button>
                </div>
              </div>
            </div>
            <button onClick={close} disabled={!data.hasDraft} style={{ padding: '14px', borderRadius: 10, border: 'none', background: data.hasDraft ? COLORS.primary : COLORS.border, color: '#fff', cursor: data.hasDraft ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>{data.hasDraft ? '🔒 Закрыть смену (провести расходы)' : '✓ Расходы проведены'}</button>
          </div>
        </div>
      </>}
    </div>
  )
}
