'use client'
// Касса дня (десктоп-финанс): дневная сверка филиала — доходы по способам (нал/каспи/QR/долг),
// проверка «оплаты+долг=продано», счета за день, остаток KASPI GOLD + перевод в банк,
// расходы (ЗП/текущие через «Деньги»), производство в запас, закрытие смены. Орг — из селектора.
import { useState, useCallback, useEffect, useRef } from 'react'
import { COLORS } from '@/lib/colors'
import { useLiveData } from '@/lib/live'
import { useAdmin } from '@/components/admin/AdminChrome'
import ModalShell from '@/components/admin/accDocs/ModalShell'
import { payDebt } from '@/lib/api/orders'
import { cashDay, cashExpense, cashRemit, cashRemitUndo, cashReturnHQ, cashReturnUndo, cashTabelSet, cashPayZp, cashCloseShift, cashMonth, profitDay, profitPost, profitUnpost, bonusDay } from '@/lib/api/finmoney'
import { fmtTime } from '@/lib/adminFmt'

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const m = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU')

export default function CashDayScreen({ orgId }: { orgId: string }) {
  const orgName = (useAdmin() as any)?.orgName || ''   // чьи счета — подпись в дропдаунах (не путать с головным)
  const [view, setView] = useState<'day' | 'month'>('day')
  const [date, setDate] = useState(todayStr())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState('')
  const [cur, setCur] = useState({ articleId: '', who: '', accountId: '', amount: '' })   // текущий расход
  const [wageAcc, setWageAcc] = useState('')                    // счёт списания ЗП (дефолт/запасной)
  const [wpick, setWpick] = useState<Record<string, boolean>>({})  // ЗП: отмеченные счета списания (птички)
  const [wamt, setWamt] = useState<Record<string, string>>({})     // ЗП: сколько снять с каждого (пусто = остаток)
  const [wsel, setWsel] = useState<Record<string, boolean>>({})    // Табель: кто отмечен на смене (из employee_shifts)
  const [wbonus, setWbonus] = useState<Record<string, string>>({})  // Выплата: бонус «+40%» вручную по сотруднику
  const [incas, setIncas] = useState({ cash: '', kaspi: '' })   // инкассация Нипа→головной (нал/каспи)
  const [retm, setRetm] = useState({ accountId: '', amount: '' })  // возврат денег ОТ головного на счёт филиала
  const [openCheck, setOpenCheck] = useState('')              // раскрытый чек в журнале дня
  const [bonus, setBonus] = useState<any>(null)        // бонусы дня: товар соседа мимо склада
  const [profit, setProfit] = useState<any>(null)             // прибыль дня: деление денег (себест / наценка)
  const [profitBusy, setProfitBusy] = useState(false)
  // Погашение долга прямо из блока «ДОЛГИ»: счёт + сумма, деньги приходят сегодняшним днём.
  const [debtFor, setDebtFor] = useState<any>(null)
  const [debtAcc, setDebtAcc] = useState('')
  const [debtSum, setDebtSum] = useState('')
  const [debtBusy, setDebtBusy] = useState(false)
  const [ym, setYm] = useState(() => todayStr().slice(0, 7))
  const [month, setMonth] = useState<any>(null)
  const toast = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 2200) }

  const loadedKey = useRef('')
  const load = useCallback(async () => { const k = orgId + date; if (loadedKey.current !== k) setLoading(true); const d = await cashDay(orgId, date); loadedKey.current = k; setData(d); setWsel(Object.fromEntries(((d?.attendance || []) as string[]).map(id => [id, true]))); const defAcc = (d?.accounts || []).find((a: any) => a.name === 'Основная касса')?.id || (d?.accounts || [])[0]?.id || ''; setWageAcc(prev => prev || defAcc); setWpick(prev => Object.values(prev).some(Boolean) ? prev : (defAcc ? { [defAcc]: true } : {})); setLoading(false) }, [orgId, date])
  const monthKey = useRef('')
  const loadMonth = useCallback(async () => {
    if (monthKey.current !== orgId + ym) setLoading(true)
    const [y, mo] = ym.split('-').map(Number); const last = new Date(y, mo, 0).getDate()
    setMonth(await cashMonth(orgId, `${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`)); monthKey.current = orgId + ym; setLoading(false)
  }, [orgId, ym])
  // Бонусы дня грузим вместе с днём — блок показывается, только если они были.
  useEffect(() => { if (view === 'day') bonusDay(orgId, date).then(setBonus).catch(() => setBonus(null)) }, [orgId, date, view])
  // Живое обновление: перезагрузка активного вида при realtime-сигнале (продажа/оплата в кабинете).
  useLiveData(() => { view === 'month' ? loadMonth() : load() }, [view, load, loadMonth])

  // Прибыль дня: посчитать (деньги дня делятся на себестоимость и наценку), провести, отменить.
  // «💵 Вернуть долг»: приход на выбранный счёт, привязан к накладной этого чека.
  async function doPayDebt() {
    if (!debtFor) return
    const sum = Math.round(Number(String(debtSum).replace(/\s/g, '').replace(',', '.')) || 0)
    if (!(sum > 0)) { toast('Укажите сумму'); return }
    if (!debtAcc) { toast('Выберите счёт'); return }
    setDebtBusy(true)
    const r: any = await payDebt({ cardId: debtFor.id, splits: [{ accountId: debtAcc, amount: sum }] })
    setDebtBusy(false)
    if (r.ok) { toast(`✓ Погашено ${m(sum)} ₸ · ${debtFor.customer || ''}`); setDebtFor(null); setDebtSum(''); load() }
    else toast('⚠ ' + (r.error || 'Не удалось'))
  }

  const calcProfit = useCallback(async () => { setProfitBusy(true); setProfit(await profitDay(orgId, date)); setProfitBusy(false) }, [orgId, date])
  async function doProfitPost() {
    setProfitBusy(true); const r: any = await profitPost(orgId, date); setProfitBusy(false)
    if (r.ok) { toast(`✓ Прибыль проведена · ${m(r.data?.profit ?? 0)} ₸`); await calcProfit(); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function doProfitUnpost() {
    setProfitBusy(true); const r: any = await profitUnpost(orgId, date); setProfitBusy(false)
    if (r.ok) { toast('↩ Проводка прибыли отменена'); await calcProfit(); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }

  async function addCurrent() {
    const amount = Number((cur.amount || '').replace(',', '.')) || 0
    if (!cur.accountId || amount <= 0) { toast('Выберите счёт и сумму'); return }
    const art = (data?.expenseArticles || []).find((a: any) => a.id === cur.articleId)
    const article = art ? art.name : 'Текущий расход'
    const r: any = await cashExpense(orgId, { kind: 'current', who: cur.who, article, expenseArticleId: cur.articleId || undefined, accountId: cur.accountId, amount, date })
    if (r.ok) { toast('✓ Расход добавлен'); setCur({ articleId: '', who: '', accountId: '', amount: '' }); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  // Табель: отметить/снять сотрудника на смене — СРАЗУ сохраняем набор дня (начисление, деньги не трогаем).
  async function saveMarks(next: Record<string, boolean>) {
    setWsel(next)
    const ids = (data?.staff || []).filter((u: any) => next[u.id]).map((u: any) => u.id)
    const r: any = await cashTabelSet(orgId, ids, date)
    if (r.ok) load(); else toast('⚠ Табель не сохранился')
  }
  const toggleMark = (id: string) => saveMarks({ ...wsel, [id]: !wsel[id] })
  // Бонус «+40%» сотрудника (введён вручную), число.
  const bonusEff = (id: string): number => Math.max(0, Math.round(Number(String(wbonus[id] ?? '').replace(/\s/g, '').replace(',', '.')) || 0))
  // Выплата ЗП+40% отмеченным: оклад (табель) + бонус (вручную по каждому).
  // Сумма со счёта при выдаче ЗП: вписанная руками, иначе «остаток» поровну между пустыми птичками.
  function zpSplits(payTotal: number) {
    const picked = (data?.accounts || []).filter((a: any) => wpick[a.id])
    const val = (id: string) => String(wamt[id] ?? '').trim()
    const typed = picked.filter((a: any) => val(a.id)), blanks = picked.filter((a: any) => !val(a.id))
    const typedSum = typed.reduce((s: number, a: any) => s + (Number(val(a.id).replace(',', '.')) || 0), 0)
    const rest = Math.max(0, Math.round(payTotal - typedSum))
    const each = blanks.length ? Math.floor(rest / blanks.length) : 0
    return picked.map((a: any, i: number) => {
      if (val(a.id)) return { accountId: a.id, amount: Math.round(Number(val(a.id).replace(',', '.')) || 0) }
      const isLast = blanks[blanks.length - 1]?.id === a.id
      return { accountId: a.id, amount: isLast ? rest - each * (blanks.length - 1) : each }
    }).filter((x: any) => x.amount > 0)
  }
  async function payZp(payTotal: number) {
    const bonuses = (data?.staff || []).filter((u: any) => wsel[u.id]).map((u: any) => ({ employeeId: u.id, amount: bonusEff(u.id) }))
    if (!bonuses.length) { toast('Отметьте в табеле кто на смене'); return }
    const splits = zpSplits(payTotal)
    if (!splits.length) { toast('Отметьте счёт списания и сумму'); return }
    const r: any = await cashPayZp(orgId, splits[0].accountId, date, bonuses, splits)
    if (r.ok) { toast(`✓ Выдано ${data?.kind === 'producer_seller' ? 'ЗП' : 'ЗП+40%'}: ${r.count} чел · ${m(r.total)}`); setWbonus({}); setWamt({}); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  // Инкассация Нипа → головной СО СПЛИТОМ: нал → ГО Осн.касса, каспи(GOLD) → ГО Банковский счёт.
  async function doRemit() {
    const cash = Number((incas.cash || '').replace(',', '.')) || 0, kaspi = Number((incas.kaspi || '').replace(',', '.')) || 0
    if (cash + kaspi <= 0) { toast('Укажите сумму (нал и/или каспи)'); return }
    const r: any = await cashRemit(orgId, cash, kaspi, date)
    if (r.ok) { toast(`🏢 Сдано головному: нал ${m(cash)} · каспи ${m(kaspi)}`); setIncas({ cash: '', kaspi: '' }); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  // Отмена сдачи за день: убирает обе проводки пары (у филиала и у головного).
  async function undoRemit() {
    if (!confirm('Отменить сдачу головному за этот день? Деньги вернутся на счета филиала.')) return
    const r: any = await cashRemitUndo(orgId, date)
    if (r.ok) { toast(`↩ Сдача отменена: ${m(r.total)}`); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  // Возврат от головного: выручка уже сдана, а на ЗП денег нет — ГО возвращает на выбранный счёт.
  async function doReturn() {
    const acc = retm.accountId || (data?.accounts || []).find((a: any) => /банков/i.test(a.name))?.id || (data?.accounts || [])[0]?.id
    const amount = Number((retm.amount || '').replace(',', '.')) || 0
    if (!acc || amount <= 0) { toast('Выберите счёт и сумму'); return }
    const r: any = await cashReturnHQ(orgId, acc, amount, date)
    if (r.ok) { toast(`↩ Головной вернул ${m(r.amount)} → ${r.to}`); setRetm({ accountId: acc, amount: '' }); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function undoReturn() {
    if (!confirm('Отменить возврат от головного за этот день?')) return
    const r: any = await cashReturnUndo(orgId, date)
    if (r.ok) { toast(`↩ Возврат отменён: ${m(r.total)}`); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function close() {
    if (!confirm('Закрыть смену? Расходы будут проведены.')) return
    const r: any = await cashCloseShift(orgId, date)
    if (r.ok) { toast('✓ Смена закрыта'); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }

  const inc = data?.income || { cash: 0, kaspi: 0, qr: 0, debt: 0, total: 0 }
  // Лента чеков дня: продажи и «прочий доход» вперемешку по времени.
  const tsOf = (v: any) => { const x = String(v || ''); const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(x) ? x : x.replace(' ', 'T') + 'Z'); return isFinite(d.getTime()) ? d.getTime() : 0 }
  const dayFeed = [
    ...((data?.cards || []) as any[]).map(c => ({ kind: 'check' as const, t: tsOf(c.ts), c })),
    ...((data?.otherIncome?.rows || []) as any[]).map(r => ({ kind: 'oi' as const, t: tsOf(r.ts), r })),
  ].sort((a, b) => b.t - a.t)
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
    <div className="anim-fade cd-root">
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
        const accts = month.accounts || []
        const endBal = month.endBal || {}
        const cell: React.CSSProperties = { padding: '6px 9px', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' }
        const th: React.CSSProperties = { ...cell, fontWeight: 700, color: COLORS.textLight, fontSize: 11.5, borderBottom: `1.5px solid ${COLORS.border}` }
        const grp: React.CSSProperties = { ...cell, textAlign: 'center', fontWeight: 800, fontSize: 11, color: COLORS.textSubtle, letterSpacing: '.03em', borderBottom: `1px solid ${COLORS.borderLight}`, background: COLORS.bgCard }
        const dim = { color: COLORS.textLight }
        // Нипа-листогиб (производитель) — раскладка как в Excel «месяц»:
        // ТОВАРНАЯ ЧАСТЬ (Продажа/Возврат/Долг/Отпуск/прав-ложь) · КАССА (QR/Каспи/Нал/Банк) ·
        // МАРЖА · ЗАРПЛАТА · Расход · ДЕНЕЖНАЯ ЧАСТЬ (остатки счетов + ИТОГ).
        if (month.kind === 'producer_seller') {
          // У листогиба процентов (60/40, ЗП+40) НЕТ — только маржа, ЗП и расходы.
          const nCols = 1 + 5 + 3 + 1 + 1 + 1 + accts.length + 1
          return <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={{ ...grp, textAlign: 'left', background: 'transparent' }}></th>
                  <th style={grp} colSpan={5}>ТОВАРНАЯ ЧАСТЬ</th>
                  <th style={grp} colSpan={3}>КАССА</th>
                  <th style={grp}>МАРЖА</th>
                  <th style={grp}>ЗАРПЛАТА</th>
                  <th style={grp}></th>
                  {accts.length > 0 && <th style={grp} colSpan={accts.length + 1}>ДЕНЕЖНАЯ ЧАСТЬ</th>}
                </tr>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Дата</th>
                  <th style={th}>Себест.</th><th style={th}>Возврат</th><th style={th}>Долг</th><th style={th}>Отпуск</th><th style={{ ...th, textAlign: 'center' }}>прав/ложь</th>
                  <th style={th}>QR</th><th style={th}>Каспи</th><th style={th}>Нал</th>
                  <th style={th}>Маржа</th><th style={th}>ЗП</th>
                  <th style={th}>Расход</th>
                  {accts.map((a: any) => <th key={a.id} style={th} title={a.name}>{a.name}</th>)}
                  {accts.length > 0 && <th style={th}>ИТОГ</th>}
                </tr>
              </thead>
              <tbody>
                {(month.days || []).map((d: any) => <tr key={d.day} style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{d.day.slice(8)}.{d.day.slice(5, 7)}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{m(d.cost)}</td>
                  <td style={{ ...cell, color: d.ret ? COLORS.primaryDark : COLORS.textLight }}>{d.ret ? m(d.ret) : '—'}</td>
                  <td style={{ ...cell, color: COLORS.primaryDark }}>{d.debt ? m(d.debt) : '—'}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{m(d.otpusk)}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{d.ok ? '✅' : '❌'}</td>
                  <td style={cell}>{d.qr ? m(d.qr) : '—'}</td><td style={cell}>{d.kaspi ? m(d.kaspi) : '—'}</td><td style={cell}>{d.cash ? m(d.cash) : '—'}</td>
                  <td style={{ ...cell, fontWeight: 700, color: '#2e8a5e' }}>{d.margin ? m(d.margin) : '—'}</td>
                  <td style={cell}>{d.salary ? m(d.salary) : '—'}</td>
                  <td style={cell}>{d.current ? m(d.current) : '—'}</td>
                  {accts.map((a: any) => <td key={a.id} style={{ ...cell, color: (d.bal?.[a.id] || 0) < 0 ? COLORS.primaryDark : COLORS.text }}>{m(d.bal?.[a.id] || 0)}</td>)}
                  {accts.length > 0 && <td style={{ ...cell, fontWeight: 700 }}>{m(d.balTotal || 0)}</td>}
                </tr>)}
                {(month.days || []).length === 0 && <tr><td colSpan={nCols} style={{ ...cell, textAlign: 'center', color: COLORS.textMuted, padding: 24 }}>Продаж за месяц нет</td></tr>}
              </tbody>
              <tfoot><tr style={{ borderTop: `2px solid ${COLORS.border}`, background: COLORS.bgCard }}>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>ИТОГО ({t.cnt || 0})</td>
                <td style={{ ...cell, fontWeight: 800 }}>{m(t.cost)}</td>
                <td style={{ ...cell, fontWeight: 800, color: COLORS.primaryDark }}>{m(t.ret)}</td>
                <td style={{ ...cell, fontWeight: 800, color: COLORS.primaryDark }}>{m(t.debt)}</td>
                <td style={{ ...cell, fontWeight: 800 }}>{m(t.otpusk)}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{month.ok ? '✅' : '❌'}</td>
                <td style={{ ...cell, fontWeight: 800 }}>{m(t.qr)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.kaspi)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.cash)}</td>
                <td style={{ ...cell, fontWeight: 800, color: '#2e8a5e' }}>{m(t.margin)}</td>
                <td style={{ ...cell, fontWeight: 800 }}>{m(t.salary)}</td>
                <td style={{ ...cell, fontWeight: 800 }}>{m(t.current)}</td>
                {accts.map((a: any) => <td key={a.id} style={{ ...cell, fontWeight: 800, color: (endBal[a.id] || 0) < 0 ? COLORS.primaryDark : COLORS.text }}>{m(endBal[a.id] || 0)}</td>)}
                {accts.length > 0 && <td style={{ ...cell, fontWeight: 800 }}>{m(month.endBalTotal || 0)}</td>}
              </tr></tfoot>
            </table>
            {accts.length > 0 && <div style={{ padding: '8px 14px', fontSize: 12, color: COLORS.textLight, borderTop: `1px solid ${COLORS.borderLight}` }}>Старт остатков на 1-е число (из истории): {accts.map((a: any) => `${a.name} ${m((month.opening || {})[a.id] || 0)}`).join(' · ')} · Себест. = Σ(кол-во × приходная цена) · Отпуск = себест+долг−возврат · Маржа = КАССА−себест · ЗП = оклад по табелю.</div>}
          </div>
        }
        return <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ ...grp, textAlign: 'left', background: 'transparent' }}></th>
                <th style={grp} colSpan={5}>ТОВАРНАЯ ЧАСТЬ</th>
                <th style={grp} colSpan={3}>КАССА</th>
                <th style={grp} colSpan={3}>МАРЖА</th>
                <th style={grp} colSpan={2}>ЗАРПЛАТА</th>
                <th style={grp}></th>
                {accts.length > 0 && <th style={grp} colSpan={accts.length}>ОСТАТКИ СЧЕТОВ</th>}
              </tr>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Дата</th>
                <th style={th}>Себест.</th><th style={th}>Возврат</th><th style={th}>Долг</th><th style={th}>Отпуск</th><th style={{ ...th, textAlign: 'center' }}>✓</th>
                <th style={th}>Наличка</th><th style={th}>Каспи</th><th style={th}>QR</th>
                <th style={th}>Маржа</th><th style={th}>60%</th><th style={th}>40%</th>
                <th style={th}>ЗП</th><th style={th}>ЗП+40</th>
                <th style={th}>Расход</th>
                {accts.map((a: any) => <th key={a.id} style={th} title={a.name}>{a.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {(month.days || []).map((d: any) => <tr key={d.day} style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{d.day.slice(8)}.{d.day.slice(5, 7)}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{m(d.cost)}</td>
                <td style={{ ...cell, color: d.ret ? COLORS.primaryDark : COLORS.textLight }}>{d.ret ? m(d.ret) : '—'}</td>
                <td style={{ ...cell, color: COLORS.primaryDark }}>{m(d.debt)}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{m(d.otpusk)}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{d.ok ? '✅' : '❌'}</td>
                <td style={cell}>{m(d.cash)}</td><td style={cell}>{m(d.kaspi)}</td><td style={cell}>{m(d.qr)}</td>
                <td style={{ ...cell, fontWeight: 700, color: '#2e8a5e' }}>{m(d.margin)}</td>
                <td style={{ ...cell, ...dim }}>{m(d.split60)}</td><td style={{ ...cell, ...dim }}>{m(d.split40)}</td>
                <td style={cell}>{d.salary ? m(d.salary) : '—'}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{m(d.zpPlus40)}</td>
                <td style={cell}>{d.current ? m(d.current) : '—'}</td>
                {accts.map((a: any) => <td key={a.id} style={{ ...cell, color: (d.bal?.[a.id] || 0) < 0 ? COLORS.primaryDark : COLORS.text }}>{m(d.bal?.[a.id] || 0)}</td>)}
              </tr>)}
              {(month.days || []).length === 0 && <tr><td colSpan={15 + accts.length} style={{ ...cell, textAlign: 'center', color: COLORS.textMuted, padding: 24 }}>Продаж за месяц нет</td></tr>}
            </tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${COLORS.border}`, background: COLORS.bgCard }}>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>ИТОГО ({t.cnt || 0})</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.cost)}</td>
              <td style={{ ...cell, fontWeight: 800, color: COLORS.primaryDark }}>{m(t.ret)}</td>
              <td style={{ ...cell, fontWeight: 800, color: COLORS.primaryDark }}>{m(t.debt)}</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.otpusk)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{month.ok ? '✅' : '❌'}</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.cash)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.kaspi)}</td><td style={{ ...cell, fontWeight: 800 }}>{m(t.qr)}</td>
              <td style={{ ...cell, fontWeight: 800, color: '#2e8a5e' }}>{m(t.margin)}</td>
              <td style={{ ...cell, fontWeight: 800, ...dim }}>{m(t.split60)}</td><td style={{ ...cell, fontWeight: 800, ...dim }}>{m(t.split40)}</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.salary)}</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.zpPlus40)}</td>
              <td style={{ ...cell, fontWeight: 800 }}>{m(t.current)}</td>
              {accts.map((a: any) => <td key={a.id} style={{ ...cell, fontWeight: 800, color: (endBal[a.id] || 0) < 0 ? COLORS.primaryDark : COLORS.text }}>{m(endBal[a.id] || 0)}</td>)}
            </tr></tfoot>
          </table>
          {accts.length > 0 && <div style={{ padding: '8px 14px', fontSize: 12, color: COLORS.textLight, borderTop: `1px solid ${COLORS.borderLight}` }}>Старт остатков на 1-е число (из истории): {accts.map((a: any) => `${a.name} ${m((month.opening || {})[a.id] || 0)}`).join(' · ')}</div>}
        </div>
      })()) : !data ? <div style={{ ...card, textAlign: 'center', color: COLORS.textMuted }}>Нет данных</div> : <>
        {/* ОТЧЁТ ДНЯ (как Excel «Отчет дня»): ПРОДАЖА · РАСХОД · ИТОГ — считается при закрытии смены */}
        {data.report && (() => {
          const r = data.report
          const sub: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: COLORS.textSubtle, marginBottom: 6 }
          const line: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13.5 }
          return (
            <div style={{ ...card, marginBottom: 16, borderLeft: `4px solid ${COLORS.primary}` }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>📄 ОТЧЁТ ДНЯ</div>
              <div className="cd-rep">
                {/* ПРОДАЖА */}
                <div>
                  <div style={sub}>ПРОДАЖА</div>
                  <div style={line}><span>Продано</span><b>{m(r.sold)} ₸</b></div>
                  <div style={line}><span>Наценка</span><b style={{ color: '#2e8a5e' }}>{m(r.margin)} ₸ · {Math.round((r.marginPct || 0) * 100)}%</b></div>
                  <div style={line}><span>Долг</span><b style={{ color: COLORS.primaryDark }}>{m(r.debt)} ₸</b></div>
                  <div style={{ ...line, color: COLORS.textLight, fontSize: 12.5, borderTop: `1px solid ${COLORS.borderLight}`, marginTop: 4, paddingTop: 6 }}><span>нал {m(r.cash)} · каспи {m(r.kaspi)} · QR {m(r.qr)}</span></div>
                </div>
                {/* РАСХОД */}
                <div>
                  <div style={sub}>РАСХОД</div>
                  {(r.sellers || []).map((s: any, i: number) => (
                    <div key={i} style={{ ...line, fontSize: 12.5 }}><span>👤 {s.name}<span style={{ color: COLORS.textLight }}> · оклад {m(s.oklad)}{data?.kind === 'producer_seller' ? '' : ` + 40% ${m(s.bonus)}`}</span></span><b>{m(s.zp)}</b></div>
                  ))}
                  <div style={{ ...line, fontWeight: 800, borderTop: `1px solid ${COLORS.borderLight}`, marginTop: 2, paddingTop: 6 }}><span>ЗП всего</span><b>{m(r.zpTotal)} ₸</b></div>
                  <div style={line}><span>Расходы магазина</span><b style={{ color: COLORS.primaryDark }}>{m(r.shopExp)} ₸</b></div>
                </div>
                {/* ИТОГ */}
                <div style={{ background: '#eef7f1', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={sub}>ИТОГ</div>
                  <div style={line}><span>Продажа</span><span>{m(r.sold)}</span></div>
                  <div style={line}><span>− ЗП</span><span>{m(r.zpTotal)}</span></div>
                  <div style={line}><span>− Расходы</span><span>{m(r.shopExp)}</span></div>
                  <div style={{ ...line, fontWeight: 800, fontSize: 18, color: '#2e8a5e', borderTop: `1px solid #cfe6d8`, marginTop: 4, paddingTop: 8 }}><span>Итого</span><span>{m(r.result)} ₸</span></div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ДОЛГИ (дебиторка) — непогашенные чеки орг (не по дню) */}
        {(data.debts || []).length > 0 && (
          <div style={{ ...card, marginBottom: 16, padding: 0, overflow: 'hidden', borderLeft: `4px solid ${COLORS.primaryDark}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 16px 10px' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.primaryDark, letterSpacing: '.04em' }}>💳 ДОЛГИ</span>
              <span style={{ fontSize: 12.5, color: COLORS.textLight }}>{(data.debts || []).length} чек.</span>
              <b style={{ marginLeft: 'auto', fontSize: 16, color: COLORS.primaryDark }}>{m(data.debtTotal)} ₸</b>
            </div>
            {(data.debts || []).map((x: any) => (
              <div key={x.id} className="cd-row" style={{ padding: '9px 16px', borderTop: `1px solid ${COLORS.borderLight}` }}>
                <span style={{ fontSize: 13.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{x.customer || 'Розница'}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#2e8a5e', width: 150 }}>{x.docNumber || x.id}</span>
                <span style={{ fontSize: 12.5, color: COLORS.textLight, width: 100 }}>{x.seller ? `👤 ${x.seller}` : '—'}</span>
                <b style={{ fontSize: 14.5, width: 110, textAlign: 'right', color: COLORS.primaryDark }}>{m(x.debt)} ₸</b>
                <button onClick={() => { setDebtFor(x); setDebtSum(String(Math.round(Number(x.debt) || 0))); setDebtAcc(prev => prev || (accts[0]?.id || '')) }}
                  style={{ marginLeft: 10, border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>💵 Вернуть долг</button>
              </div>
            ))}
            <div style={{ padding: '6px 16px 10px', fontSize: 11.5, color: COLORS.textLight }}>Клиент принёс деньги — «💵 Вернуть долг»: приход сегодняшним днём на выбранный счёт.</div>
          </div>
        )}

        {/* Окно погашения долга — через общий ModalShell (портал в body, Esc/фон/✕). */}
        {debtFor && (
          <ModalShell title={`💵 Вернуть долг · ${debtFor.customer || 'Розница'}`} width={440} onClose={() => setDebtFor(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: COLORS.textLight }}>{debtFor.docNumber || debtFor.id} · долг {m(debtFor.debt)} ₸</div>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>Счёт прихода</div>
                <select value={debtAcc} onChange={e => setDebtAcc(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', fontWeight: 600, background: '#fff' }}>
                  {accts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>Сумма (сегодня)</div>
                <input value={debtSum} inputMode="decimal" autoFocus onChange={e => setDebtSum(e.target.value.replace(/[^0-9.,]/g, ''))}
                  style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 20, fontFamily: 'Consolas, monospace', fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} />
              </div>
              <button onClick={doPayDebt} disabled={debtBusy} style={{ border: 'none', background: debtBusy ? '#cfd8d2' : '#2e8a5e', color: '#fff', borderRadius: 11, padding: 14, cursor: debtBusy ? 'default' : 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'inherit' }}>{debtBusy ? '…' : 'Принять оплату'}</button>
            </div>
          </ModalShell>
        )}

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

        {/* Журнал чеков дня — у магазина продажи собираются по ЧЕКАМ (в других орг это расходные накладные) */}
        <div style={{ ...card, marginBottom: 16, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 16px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textSubtle, letterSpacing: '.04em' }}>🧾 ЧЕКИ ДНЯ</span>
            <span style={{ fontSize: 12.5, color: COLORS.textLight }}>{(data.cards || []).length} шт</span>
            {Number(data.otherIncome?.total) > 0 && <span style={{ fontSize: 12.5, fontWeight: 800, color: '#7a3aaa', marginLeft: 'auto' }}>+ прочий доход {m(data.otherIncome.total)} ₸</span>}
            <b style={{ marginLeft: Number(data.otherIncome?.total) > 0 ? 10 : 'auto', fontSize: 15 }}>{m(inc.total)} ₸</b>
            <span style={{ fontSize: 12.5, color: COLORS.textLight, width: 108, textAlign: 'right' }}>
              себест {m((data.cards || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0))}
            </span>
            <span style={{ width: 14 }} />
          </div>
          {(data.cards || []).length === 0 && (data.otherIncome?.rows || []).length === 0
            ? <div style={{ padding: '18px 16px 22px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>За этот день чеков нет</div>
            : dayFeed.map((it: any) => {
              // Прочий доход — операция без товара: такая же строка журнала, со своим номером.
              if (it.kind === 'oi') {
                const r = it.r
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: `1px solid ${COLORS.borderLight}`, background: '#faf7fd' }}>
                    <span style={{ fontSize: 12.5, color: COLORS.textLight, width: 46 }}>{fmtTime(r.ts)}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: '#7a3aaa', width: 150 }}>{r.docNumber || '—'}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#7a3aaa', background: '#f0e8fa', borderRadius: 7, padding: '3px 8px', whiteSpace: 'nowrap' }}>➕ прочий доход</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: COLORS.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r.comment || '').replace(/^Прочий доход\s*·?\s*/, '') || 'без товара'}</span>
                    <span style={{ fontSize: 12.5, color: COLORS.textLight, whiteSpace: 'nowrap' }}>{r.account}</span>
                    <b style={{ fontSize: 14, color: '#5b3a8a', width: 110, textAlign: 'right' }}>{m(Number(r.amount) || 0)} ₸</b>
                    <span style={{ width: 122, textAlign: 'right', fontSize: 12, color: '#7a3aaa' }}>50/50</span>
                    <span style={{ width: 14 }} />
                  </div>
                )
              }
              const c = it.c
              const open = openCheck === c.id
              const time = fmtTime(c.ts)
              const paid = Number(c.paidCash || 0) + Number(c.paidKaspi || 0) + Number(c.paidQr || 0)
              const debt = Math.max(0, Number(c.total || 0) - paid)
              return (
                <div key={c.id} style={{ borderTop: `1px solid ${COLORS.borderLight}` }}>
                  <div onClick={() => setOpenCheck(open ? '' : c.id)} className="cd-row" style={{ padding: '10px 16px', cursor: 'pointer', background: open ? COLORS.bgCard : 'transparent' }}>
                    <span style={{ fontSize: 12, color: COLORS.textLight, width: 42 }}>{time}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#2e8a5e', width: 130 }}>{c.docNumber || c.id}</span>
                    <span style={{ fontSize: 13.5, width: 110, color: c.seller ? COLORS.text : COLORS.textLight }}>{c.seller ? `👤 ${c.seller}` : '—'}</span>
                    <span style={{ fontSize: 13.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer || 'Розница'}</span>
                    <span style={{ fontSize: 12.5, color: COLORS.textLight, width: 74 }}>{c.cnt} поз.</span>
                    <span style={{ fontSize: 12.5, width: 120, color: debt > 0 ? COLORS.primaryDark : COLORS.textLight }}>
                      {c.payment || '—'}{debt > 0 ? ` · долг ${m(debt)}` : ''}
                    </span>
                    <b style={{ fontSize: 14.5, width: 110, textAlign: 'right' }}>{m(c.total)} ₸</b>
                    {/* себестоимость чека рядом с суммой: сколько из этих денег — закуп товара */}
                    <span title={c.nocost ? `${c.nocost} поз. без закупочной цены — себестоимость неполная` : 'себестоимость товара в чеке'}
                      style={{ fontSize: 13, width: 108, textAlign: 'right', color: c.nocost ? COLORS.primaryDark : COLORS.textLight }}>
                      {m(c.cost)}{c.nocost ? ' ⚠' : ''}
                    </span>
                    <span style={{ color: COLORS.textLight, fontSize: 12, width: 14 }}>{open ? '▾' : '▸'}</span>
                  </div>
                  {open && (
                    <div className="cd-lines" style={{ padding: '2px 16px 12px 70px', background: COLORS.bgCard }}>
                      {(c.lines || []).map((l: any, i: number) => {
                        const sum = /^изделие/i.test(l.name || '') && Number(l.widthCm) > 0
                          ? Number(l.qty) * Number(l.widthCm) * Number(l.price)
                          : Number(l.qty) * Number(l.price)
                        return (
                          <div key={i} className="cd-line" style={{ padding: '4px 0', fontSize: 13, color: COLORS.textSubtle }}>
                            <span style={{ flex: 1, minWidth: 0 }}>{l.name}</span>
                            <span style={{ width: 110, textAlign: 'right', color: COLORS.textLight }}>{Number(l.qty)} {l.unit || 'шт'}{Number(l.widthCm) > 0 ? ` × ${Number(l.widthCm)} см` : ''}</span>
                            <span style={{ width: 90, textAlign: 'right', color: COLORS.textLight }}>{m(l.price)}</span>
                            <span style={{ width: 100, textAlign: 'right', fontWeight: 600 }}>{m(sum)}</span>
                          </div>
                        )
                      })}
                      {Number(c.changeSum) > 0 && <div style={{ fontSize: 12.5, color: COLORS.textLight, paddingTop: 4 }}>сдача {m(c.changeSum)} ₸</div>}
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        {/* 💰 ПРИБЫЛЬ ДНЯ — чек делится на две части ДЕНЕГ: себестоимость («Оплата от покупателей»)
            и наценка («Прочие доходы»). Накладная не трогается. Счёт прибыли — куда пришли деньги. */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: profit ? 12 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textSubtle, letterSpacing: '.04em' }}>💰 ПРИБЫЛЬ ДНЯ</span>
            {profit && <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, fontWeight: 700, background: profit.posted ? '#e8f5ee' : '#fef3c7', color: profit.posted ? '#2e8a5e' : '#92700a' }}>{profit.posted ? 'проведена' : 'не проведена'}</span>}
            <button onClick={calcProfit} disabled={profitBusy} style={{ marginLeft: 'auto', border: `1.5px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.text, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>🧮 Сформировать прибыль</button>
          </div>
          {profit && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {[['поступило денег', profit.totals.paid, COLORS.text], ['себестоимость', profit.totals.cost, COLORS.text], ['прибыль', profit.totals.profit, '#2e8a5e']].map(([l, v, c]: any) => (
                  <div key={l} style={{ background: COLORS.bgCard, borderRadius: 10, padding: '9px 14px', minWidth: 150 }}>
                    <div style={{ fontSize: 12, color: COLORS.textLight }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{m(v)} ₸</div>
                  </div>
                ))}
              </div>
              {profit.lines.length === 0
                ? <div style={{ fontSize: 13, color: COLORS.textMuted }}>За этот день денег по чекам не было</div>
                : profit.byAccount.map((a: any) => (
                  <div key={a.accountId || 'none'} style={{ background: COLORS.bgCard, borderRadius: 10, padding: '9px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
                      <span>{a.accountName}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textLight }}>оплата от покупателей {m(a.cost)}</span>
                      <b style={{ marginLeft: 'auto', color: '#2e8a5e' }}>прочие доходы {m(a.profit)} ₸</b>
                    </div>
                    {profit.lines.filter((l: any) => (l.accountId || 'none') === (a.accountId || 'none')).map((l: any) => (
                      <div key={l.paymentId} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: COLORS.textLight, padding: '2px 0' }}>
                        <span style={{ fontFamily: 'monospace' }}>{l.docNumber || l.cardId}</span>
                        {l.kind === 'return' && <span style={{ color: COLORS.primaryDark }}>возврат</span>}
                        {l.nocost > 0 && <span style={{ color: COLORS.primaryDark }}>⚠ без цены</span>}
                        <span style={{ marginLeft: 'auto' }}>{m(l.paid)}</span>
                        <span style={{ width: 92, textAlign: 'right' }}>себест {m(l.cost)}</span>
                        <span style={{ width: 92, textAlign: 'right', color: '#2e8a5e', fontWeight: 600 }}>{m(l.profit)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              {profit.warn.count > 0 && (
                <div style={{ background: '#fffaf0', border: '1px solid #f3e0b8', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, color: '#8a6f00', marginBottom: 10 }}>
                  ⚠ {profit.warn.count} накл. без закупочной цены ({profit.warn.docs.join(', ')}) — их прибыль {m(profit.warn.profit)} ₸ завышена. Головной впишет цену в приходной → нажмите «Сформировать» и проведите заново.
                </div>
              )}
              {profit.lines.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={doProfitPost} disabled={profitBusy} style={{ flex: 1, minWidth: 220, border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 10, padding: '11px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 800, fontFamily: 'inherit' }}>✓ {profit.posted ? 'Провести заново' : 'Провести прибыль'} · {m(profit.totals.profit)} ₸</button>
                  {profit.posted && <button onClick={doProfitUnpost} disabled={profitBusy} style={{ border: `1.5px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.primaryDark, borderRadius: 10, padding: '11px 14px', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>↩ Отменить проводку</button>}
                </div>
              )}
            </>
          )}
        </div>

        {/* 🎁 БОНУС ДНЯ — товар соседа («Сосед товар»): мимо склада, себестоимости нет,
            бонус делится 50/50 с головным, деньги соседа возвращаются ему. */}
        {bonus && bonus.rows?.length > 0 && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textSubtle, letterSpacing: '.04em' }}>🤝 БОНУС ДНЯ · 50/50</span>
              <span style={{ fontSize: 12.5, color: COLORS.textLight }}>товар соседей (мимо склада) · {bonus.rows.length} поз. · прибыль делим пополам с головным</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              {[['продано', bonus.totals.sold, COLORS.text], ['вернуть соседям', bonus.totals.toAgent, COLORS.primaryDark], ['бонус', bonus.totals.bonus, '#2e8a5e'], ['наша доля 50%', bonus.ourShare, '#2e8a5e'], ['Адал Строй 2 50%', bonus.totals.hqShare, '#7a3aaa']].map(([l, v, c]: any) => (
                <div key={l} style={{ background: COLORS.bgCard, borderRadius: 10, padding: '9px 14px', minWidth: 130 }}>
                  <div style={{ fontSize: 12, color: COLORS.textLight }}>{l}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{m(v)} ₸</div>
                </div>
              ))}
            </div>
            {bonus.rows.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: COLORS.textLight, padding: '3px 0', borderTop: `1px solid ${COLORS.borderLight}` }}>
                <span style={{ fontFamily: 'monospace' }}>{r.docNumber || r.cardId}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.text }}>{r.productName} · {Number(r.qty)} × {m(r.price)}</span>
                <span style={{ color: '#7a3aaa' }}>{r.agent || '—'}</span>
                <span style={{ width: 92, textAlign: 'right' }}>соседу {m(Number(r.cost) * Number(r.qty))}</span>
                <span style={{ width: 86, textAlign: 'right', color: '#2e8a5e', fontWeight: 600 }}>бонус {m(r.bonus)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="cd-cols">
          {/* Левая: счета + GOLD */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textSubtle, letterSpacing: '.04em', marginBottom: 10 }}>💰 СЧЕТА ЗА ДЕНЬ (продажи − расходы)</div>
              {/* Каждый счёт — отдельный блок (карточка), чтобы не сливались в один */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {accts.map((a: any) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: COLORS.bgCard, boxShadow: `0 0 0 1.5px ${COLORS.border}`, fontSize: 14 }}>
                    <span><b>{a.name}</b><span style={{ color: COLORS.textLight, fontSize: 12 }}>{a.fromSales ? ` · продажи ${m(a.fromSales)}` : ''}{a.fromFin ? ` · движ ${m(a.fromFin)}` : ''}</span></span>
                    <b style={{ fontSize: 15, color: a.net < 0 ? COLORS.primaryDark : COLORS.text }}>{m(a.net)} ₸</b>
                  </div>
                ))}
              </div>
            </div>
            {/* Инкассация: деньги проходят 3 уровня — у мастера → у филиала → у головного (закрывает долг) */}
            <div style={{ ...card, background: '#fff8ef', boxShadow: '0 0 0 1.5px #f0d9b0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#8a6f00', letterSpacing: '.04em', marginBottom: 10 }}>💼 ИНКАССАЦИЯ</div>
              {(() => { const L = data.levels || {}; return <>
                {/* Инкассация Нипа → головной СО СПЛИТОМ по счетам */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: `0 0 0 1px ${COLORS.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#8a6f00' }}>💰 У Нипы</span>
                    <span style={{ fontSize: 12, color: COLORS.textLight }}>Наличка {m(L.masterCash)} · KASPI GOLD {m(L.masterGold)}</span>
                    <b style={{ fontSize: 16, marginLeft: 'auto', color: '#8a6f00' }}>{m(L.master)} ₸</b>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <label style={{ flex: 1, fontSize: 10.5, color: COLORS.textLight }}>нал → ГО Осн.касса<input value={incas.cash} inputMode="decimal" onChange={e => setIncas(x => ({ ...x, cash: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ display: 'block', width: '100%', marginTop: 3, padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' }} /></label>
                    <label style={{ flex: 1, fontSize: 10.5, color: COLORS.textLight }}>каспи GOLD → ГО Банк<input value={incas.kaspi} inputMode="decimal" onChange={e => setIncas(x => ({ ...x, kaspi: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="0" style={{ display: 'block', width: '100%', marginTop: 3, padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' }} /></label>
                  </div>
                  <button onClick={doRemit} style={{ marginTop: 8, width: '100%', border: 'none', background: '#2a5aaa', color: '#fff', borderRadius: 7, padding: '10px', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>🏢 Сдать головному ↓ (нал → касса · каспи → банк)</button>
                  <button onClick={undoRemit} style={{ marginTop: 6, width: '100%', border: `1.5px solid ${COLORS.border}`, background: '#fff', color: '#b03020', borderRadius: 7, padding: '8px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>↩ Отменить сдачу за этот день</button>
                </div>
                {/* Возврат ОТ головного: денег на ЗП не хватает — ГО возвращает на счёт филиала (1 действие) */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: `0 0 0 1px ${COLORS.border}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2a5aaa', marginBottom: 7 }}>↩ Вернуть деньги от головного</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={retm.accountId || (data.accounts || []).find((a: any) => /банков/i.test(a.name))?.id || ''} onChange={e => setRetm(x => ({ ...x, accountId: e.target.value }))} style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                      {(data.accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input value={retm.amount} inputMode="decimal" onChange={e => setRetm(x => ({ ...x, amount: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="сумма" style={{ width: 110, padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit' }} />
                  </div>
                  <button onClick={doReturn} style={{ marginTop: 8, width: '100%', border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 7, padding: '10px', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>↩ Получить от головного (деньги на счёт → можно платить ЗП)</button>
                  <button onClick={undoReturn} style={{ marginTop: 6, width: '100%', border: `1.5px solid ${COLORS.border}`, background: '#fff', color: '#b03020', borderRadius: 7, padding: '8px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>↩ Отменить возврат за этот день</button>
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#7a3aaa', letterSpacing: '.04em' }}>📦 СДЕЛАНО НА ЗАПАС СЕГОДНЯ</span>
                <span style={{ fontSize: 12.5, color: COLORS.textLight, marginLeft: 'auto' }}>всего <b style={{ color: COLORS.text }}>{m(data.stock?.qty)}</b> шт</span>
              </div>
              {(data.stock?.items || []).length === 0
                ? <div style={{ fontSize: 13, color: COLORS.textMuted }}>Сегодня на запас ничего не сделано</div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(data.stock?.items || []).map((it: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: i ? `1px solid ${COLORS.borderLight}` : 'none' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                        {it.widthCm > 0 && !/см/i.test(it.name || '') && <span style={{ fontSize: 11.5, color: '#7a3aaa', fontWeight: 700, background: '#f3eeff', padding: '1px 8px', borderRadius: 20, flexShrink: 0 }}>{it.widthCm} см</span>}
                        <b style={{ fontSize: 14, width: 70, textAlign: 'right', flexShrink: 0 }}>{m(it.qty)} шт</b>
                      </div>
                    ))}
                  </div>}
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
              {/* ТАБЕЛЬ — отметить кто на смене (НАЧИСЛЕНИЕ: оклад попадает в колонку ЗП; деньги НЕ списываются) */}
              <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>👤 ТАБЕЛЬ — кто на смене</span>
                  {(data.staff || []).length > 0 && (() => {
                    const allOn = (data.staff || []).every((u: any) => wsel[u.id])
                    return <button onClick={() => saveMarks(allOn ? {} : Object.fromEntries((data.staff || []).map((u: any) => [u.id, true])))} style={{ border: 'none', background: COLORS.bg, color: COLORS.textMuted, borderRadius: 6, padding: '3px 9px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>{allOn ? 'Снять всех' : 'Все'}</button>
                  })()}
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: COLORS.textMuted }}>оклад → колонка ЗП (начисление)</span>
                </div>
                {(data.staff || []).length === 0 ? <div style={{ fontSize: 13, color: COLORS.textMuted, padding: '6px 0' }}>Нет сотрудников — добавьте в разделе «👥 Сотрудники»</div>
                  : (data.staff || []).map((u: any) => {
                    const on = !!wsel[u.id]
                    const wage = Math.round(Number(u.dailyWage) || 0)
                    return (
                      <div key={u.id} className="cd-wrap" style={{ padding: '8px 8px', borderBottom: `1px solid ${COLORS.borderLight}`, background: on ? '#e8f5ee' : 'transparent' }}>
                        <button onClick={() => toggleMark(u.id)} style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', background: on ? '#2e8a5e' : 'transparent', boxShadow: `inset 0 0 0 2px ${on ? '#2e8a5e' : COLORS.border}`, border: 'none', cursor: 'pointer', padding: 0 }}>{on ? '✓' : ''}</button>
                        <span onClick={() => toggleMark(u.id)} style={{ flex: 1, fontSize: 13.5, cursor: 'pointer' }}>{u.name}{u.position ? <span style={{ color: COLORS.textLight, fontSize: 12 }}> · {u.position}</span> : ''}</span>
                        <span style={{ width: 120, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: on ? COLORS.text : COLORS.textLight, fontFamily: 'Consolas, monospace' }}>{m(wage)}</span>
                        <span style={{ fontSize: 13, color: COLORS.textMuted }}>₸</span>
                      </div>
                    )
                  })}
                {/* Выдача ЗП+40% — реальная выплата: оклад (табель) + бонус, который админ делит ВРУЧНУЮ */}
                {(() => {
                  const marked = (data.staff || []).filter((u: any) => wsel[u.id])
                  const N = marked.length
                  const noPct = data?.kind === 'producer_seller'   // листогиб: процентов нет, только оклад
                  const pool = Math.round((Number(data.report?.margin) || 0) * 0.4)   // ориентир: доступный пул 40% маржи
                  const rows = marked.map((u: any) => { const oklad = Math.round(Number(u.dailyWage) || 0); const bonus = bonusEff(u.id); return { u, oklad, bonus, total: oklad + bonus } })
                  const bonusSum = rows.reduce((s: number, r: any) => s + r.bonus, 0)
                  const payTotal = rows.reduce((s: number, r: any) => s + r.total, 0)
                  if (N === 0) return null
                  return (
                    <div style={{ marginTop: 12, background: '#eef7f1', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#2e8a5e', letterSpacing: '.03em' }}>{noPct ? '💵 ВЫДАТЬ ЗП' : '💵 ВЫДАТЬ ЗП+40%'}</span>
                        {!noPct && <span style={{ fontSize: 11.5, color: COLORS.textLight }}>пул 40% маржи: <b style={{ color: '#2e8a5e' }}>{m(pool)}</b> · роздано {m(bonusSum)}</span>}
                      </div>
                      {/* Счета списания: птичка + сумма с каждого (пусто = остаток). Если на одном
                          счёте денег не хватает — отмечаем второй и делим сумму между ними. */}
                      <div style={{ background: '#fff', borderRadius: 8, padding: '6px 9px', marginBottom: 8, boxShadow: `0 0 0 1px ${COLORS.border}` }}>
                        <div style={{ fontSize: 11.5, color: COLORS.textLight, marginBottom: 4 }}>Снять со счетов (пусто = остаток):</div>
                        {accts.map((a: any) => {
                          const on = !!wpick[a.id]
                          const auto = (zpSplits(payTotal).find((x: any) => x.accountId === a.id) || { amount: 0 }).amount
                          return (
                            <div key={a.id} className="cd-wrap" style={{ padding: '4px 0', gap: 8 }}>
                              <button onClick={() => setWpick(p => ({ ...p, [a.id]: !p[a.id] }))} style={{ width: 19, height: 19, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: '#fff', background: on ? '#2e8a5e' : 'transparent', boxShadow: `inset 0 0 0 2px ${on ? '#2e8a5e' : COLORS.border}`, border: 'none', cursor: 'pointer', padding: 0 }}>{on ? '✓' : ''}</button>
                              <span onClick={() => setWpick(p => ({ ...p, [a.id]: !p[a.id] }))} style={{ flex: 1, minWidth: 0, fontSize: 13, cursor: 'pointer', color: on ? COLORS.text : COLORS.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                              <input value={wamt[a.id] ?? ''} inputMode="decimal" disabled={!on} placeholder={on ? m(auto) : ''}
                                onChange={e => setWamt(w => ({ ...w, [a.id]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                                style={{ width: 100, textAlign: 'right', padding: '5px 8px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: 'Consolas, monospace', fontWeight: 700, outline: 'none', background: on ? '#fff' : COLORS.bg }} />
                            </div>
                          )
                        })}
                      </div>
                      {rows.map((r: any) => (
                        <div key={r.u.id} className="cd-wrap" style={{ padding: '5px 0', borderTop: `1px solid ${COLORS.borderLight}` }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {r.u.name}</span>
                          <span style={{ width: 90, textAlign: 'right', fontSize: 12.5, color: COLORS.textLight }}>оклад {m(r.oklad)}</span>
                          <span style={{ fontSize: 13, color: COLORS.textMuted }}>+</span>
                          <input value={wbonus[r.u.id] ?? ''} inputMode="decimal" placeholder={noPct ? 'бонус' : '40%'}
                            onChange={e => setWbonus(w => ({ ...w, [r.u.id]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                            style={{ width: 90, textAlign: 'right', padding: '6px 8px', borderRadius: 7, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'Consolas, monospace', fontWeight: 700, outline: 'none' }} />
                          <b style={{ width: 90, textAlign: 'right', fontSize: 13.5 }}>{m(r.total)}</b>
                        </div>
                      ))}
                      <button onClick={() => payZp(payTotal)} disabled={!(payTotal > 0)} style={{ marginTop: 10, width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: payTotal > 0 ? '#2e8a5e' : COLORS.border, color: '#fff', cursor: payTotal > 0 ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{`${noPct ? '💵 Выдать ЗП' : '💵 Выдать ЗП+40%'}${payTotal > 0 ? ' · ' + m(payTotal) : ''}`}</button>
                    </div>
                  )
                })()}
              </div>
              {/* Текущий расход — по статье (как в 1С) */}
              <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>🧾 Текущий расход</div>
                <select value={cur.articleId} onChange={e => setCur(x => ({ ...x, articleId: e.target.value }))} style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', marginBottom: 8 }}>
                  <option value="">— статья ДДС —</option>
                  {(() => { const ACT: any = { operating: 'Операционная', transfer: 'Перемещения', financial: 'Финансовая', investing: 'Инвестиционная' }; return Object.entries((data.expenseArticles || []).reduce((g: any, a: any) => { const k = ACT[a.activity] || a.activity || 'Прочее'; (g[k] = g[k] || []).push(a); return g }, {})).map(([grp, arts]: any) => <optgroup key={grp} label={grp}>{arts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>) })()}
                </select>
                <div className="cd-wrap" style={{ gap: 8 }}>
                  <input value={cur.who} onChange={e => setCur(x => ({ ...x, who: e.target.value }))} placeholder="комментарий (необязательно)" style={{ flex: 1, padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <select value={cur.accountId} onChange={e => setCur(x => ({ ...x, accountId: e.target.value }))} style={{ width: 150, padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff' }}>
                    <option value="">— счёт —</option>{accts.map((a: any) => <option key={a.id} value={a.id}>{orgName ? `${orgName} · ` : ''}{a.name}</option>)}
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
