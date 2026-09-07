// Смена мастера за день: доходы (продажи нал/каспи/QR/долг), проверка (оплаты+долг=продано),
// производство в запас, расходы (ЗП + текущие через «Деньги»), остатки по счетам (с учётом
// продаж и переводов), остаток KASPI GOLD (личный сбор мастера), перевод GOLD→банк, закрытие.
import { sqlClient } from '../lib/db'
import { financeDay, saveFinRow, postFinDay } from './finmoney.service'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0
const findAcc = (accts: any[], nm: string) => accts.find((a: any) => (a.name || '').trim().toLowerCase() === nm.toLowerCase())

export async function masterShift(orgId: string, date: string) {
  // Доходы: проданные карточки за день (по дате расходной накладной).
  const incRow = (await sqlClient`
    select coalesce(sum(o.paid_cash),0)::float cash, coalesce(sum(o.paid_kaspi),0)::float kaspi,
      coalesce(sum(o.paid_qr),0)::float qr, coalesce(sum(t.total),0)::float total
    from orders o
    join documents d on d.id = o.linked_doc_id and d.date=${date} and d.status<>'cancelled'
    join (select card_id, sum(qty*price) total from order_positions group by card_id) t on t.card_id = o.id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
  ` as unknown as Array<any>)[0] || { cash: 0, kaspi: 0, qr: 0, total: 0 }
  // Чеки дня: карточка + кто пробил (seller), покупатель, номер накладной, состав (для журнала кассы).
  const cards = await sqlClient`
    select o.id, o.payment, o.seller, o.paid_cash::float "paidCash", o.paid_kaspi::float "paidKaspi", o.paid_qr::float "paidQr",
      o.change_sum::float "changeSum", t.total::float total, t.cnt::int cnt, c.name customer, d.number "docNumber", o.updated_at ts
    from orders o
    join documents d on d.id = o.linked_doc_id and d.date=${date} and d.status<>'cancelled'
    join (select card_id, sum(qty*price) total, count(*) cnt from order_positions group by card_id) t on t.card_id = o.id
    left join contragents c on c.id = o.contact_id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
    order by o.updated_at desc
  ` as unknown as Array<any>
  // Состав чеков одним запросом — журнал раскрывается без похода за каждой карточкой.
  const ids = cards.map((c: any) => c.id)
  const lines = ids.length ? await sqlClient`
    select card_id "cardId", coalesce(name1c, oral) name, qty::float qty, price::float price, width_cm::float "widthCm", unit
    from order_positions where card_id = any(${ids}) order by id
  ` as unknown as Array<any> : []
  for (const c of cards) (c as any).lines = lines.filter((l: any) => l.cardId === c.id)

  const cash = num(incRow.cash), kaspi = num(incRow.kaspi), qr = num(incRow.qr), total = num(incRow.total)
  const paid = cash + kaspi + qr
  const debt = Math.max(0, total - paid)
  const income = { cash, kaspi, qr, debt, total }
  // Проверка (как в Excel): оплаты + долг = продано (отпуск). Diff должен быть 0.
  const diff = Math.round((paid + debt) - total)
  const check = { paid, debt, sold: total, diff, ok: Math.abs(diff) < 1 }

  // Производство в запас за день.
  const stkRow = (await sqlClient`
    select coalesce(sum(dl.amount),0)::float amount, coalesce(sum(dl.qty),0)::float qty
    from documents d join document_lines dl on dl.document_id = d.id
    where d.org_id=${orgId} and d.type='production' and d.status<>'cancelled' and d.date=${date} and dl.role='output'
  ` as unknown as Array<any>)[0] || { amount: 0, qty: 0 }

  // «Деньги» за день (расходы + переводы).
  const fd = await financeDay(orgId, date)
  const expRows = (fd.rows || []).map((r: any) => ({ ...r, amt: (r.amounts || []).reduce((s: number, a: any) => s + num(a.amount), 0) })).filter((r: any) => r.amt < 0 && r.type !== 'mv')
  const salaryTotal = expRows.filter((r: any) => (r.article || '') === 'ЗП').reduce((s: number, r: any) => s - r.amt, 0)
  const currentTotal = expRows.filter((r: any) => (r.article || '') !== 'ЗП').reduce((s: number, r: any) => s - r.amt, 0)
  const hasDraft = (fd.rows || []).some((r: any) => r.status !== 'posted' && (r.amounts || []).some((a: any) => num(a.amount) !== 0))

  // Остаток по счетам за день: продажи (payments) + движения «Денег» (расходы/переводы).
  const payDay = await sqlClient`
    select cash_account_id::text acc, coalesce(sum(case when direction='in' then amount else -amount end),0)::float net
    from payments where org_id=${orgId} and date=${date} and cash_account_id is not null group by cash_account_id
  ` as unknown as Array<any>
  const payMap: Record<string, number> = {}; for (const p of payDay) payMap[p.acc] = num(p.net)
  const finMap: Record<string, number> = {}; for (const r of (fd.rows || [])) for (const am of (r.amounts || [])) finMap[am.accountId] = (finMap[am.accountId] || 0) + num(am.amount)
  const accounts = (fd.accounts || []).map((a: any) => ({ id: a.id, name: a.name, fromSales: payMap[a.id] || 0, fromFin: finMap[a.id] || 0, net: (payMap[a.id] || 0) + (finMap[a.id] || 0) }))

  // Накопительные остатки по счетам (оплаты продаж + движения «Денег»). 3 уровня инкассации:
  // у мастера = Наличка + KASPI GOLD; у филиала = Банковский счёт; у головного = отдано (payments out мосту).
  const balOf = async (accId?: string) => {
    if (!accId) return 0
    const p = (await sqlClient`select coalesce(sum(case when direction='in' then amount else -amount end),0)::float v from payments where org_id=${orgId} and cash_account_id=${accId}` as unknown as Array<any>)[0]
    const f = (await sqlClient`select coalesce(sum(a.amount),0)::float v from fin_row_amounts a join fin_rows r on r.id=a.row_id where r.org_id=${orgId} and r.status='posted' and a.account_id=${accId}` as unknown as Array<any>)[0]
    return num(p.v) + num(f.v)
  }
  const gold = findAcc(fd.accounts || [], 'KASPI GOLD'), cashA = findAcc(fd.accounts || [], 'Основная касса'), bankA = findAcc(fd.accounts || [], 'Банковский счет')
  const goldBalance = await balOf(gold?.id), cashBalance = await balOf(cashA?.id), bankBalance = await balOf(bankA?.id)
  // Долг перед головным (мы закупаем у него в долг) + сколько уже отдано (инкассировано головному).
  const bridge = (await sqlClient`select c.id::text id from contragents c join organizations o on o.id=c.org_ref_id and o.kind='hq' where c.org_id=${orgId} limit 1` as unknown as Array<any>)[0]
  let debtHQ = 0, remittedHQ = 0
  if (bridge) {
    const pur = (await sqlClient`select coalesce(sum(total),0)::float v from documents where org_id=${orgId} and contragent_id=${bridge.id} and type='purchase' and status<>'cancelled'` as unknown as Array<any>)[0]
    const rem = (await sqlClient`select coalesce(sum(amount),0)::float v from payments where org_id=${orgId} and contragent_id=${bridge.id} and direction='out'` as unknown as Array<any>)[0]
    remittedHQ = num(rem.v)
    debtHQ = num(pur.v) - remittedHQ
  }

  // Сотрудники филиала (справочник) — для оплаты ЗП списком, с дневным окладом.
  const staff = await sqlClient`select id::text, name, position, daily_wage::float "dailyWage" from employees where org_id=${orgId} and archived=false order by name` as unknown as Array<any>
  // Статьи расходов (как в 1С: 7100/7200/7400) — для «текущего расхода».
  const expenseArticles = await sqlClient`select id::text, name, activity, direction from fin_expense_articles where org_id=${orgId} and archived=false and is_group=false order by activity, sort_order, name` as unknown as Array<any>

  // ── ОТЧЁТ ДНЯ (как Excel «Отчет дня») ──────────────────────────────────────────
  // Наценка дня = продано − себестоимость (price_in проданных позиций).
  const costRow = (await sqlClient`
    select coalesce(sum(op.qty*coalesce(p.price_in,0)),0)::float cost
    from orders o join documents d on d.id=o.linked_doc_id and d.date=${date} and d.status<>'cancelled'
    join order_positions op on op.card_id=o.id
    left join products p on p.id=op.product_id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
  ` as unknown as Array<any>)[0] || { cost: 0 }
  const margin = Math.max(0, total - num(costRow.cost))
  // Продавцы на смене = кто пробил чек в этот день (между ними делится 40% наценки).
  const sellersDay = await sqlClient`
    select coalesce(nullif(trim(o.seller),''),'—') name
    from orders o join documents d on d.id=o.linked_doc_id and d.date=${date} and d.status<>'cancelled'
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false and coalesce(trim(o.seller),'')<>''
    group by 1 order by 1
  ` as unknown as Array<any>
  const wageByName: Record<string, number> = {}; for (const s of staff) wageByName[(s.name || '').trim().toLowerCase()] = num(s.dailyWage)
  const N = sellersDay.length
  const bonusEach = N > 0 ? (margin * 0.4) / N : 0     // 40% наценки поровну между продавцами
  const reportSellers = sellersDay.map((s: any) => { const oklad = wageByName[(s.name || '').trim().toLowerCase()] || 0; return { name: s.name, oklad, bonus: bonusEach, zp: oklad + bonusEach } })
  const zpTotal = reportSellers.reduce((a: number, r: any) => a + r.zp, 0)   // ЗП = Σ(оклад + 40%/N)
  const shopExp = currentTotal                          // расходы магазина/административные
  const dayResult = total - zpTotal - shopExp           // итого дня = продажа − ЗП − расходы
  const report = { sold: total, margin, marginPct: total > 0 ? margin / total : 0, cash, kaspi, qr, debt, sellers: reportSellers, zpTotal, shopExp, result: dayResult }

  return {
    date, income, check, cards, staff, expenseArticles, report,
    stock: { amount: num(stkRow.amount), qty: num(stkRow.qty) },
    expenses: { rows: expRows, salaryTotal, currentTotal, total: salaryTotal + currentTotal },
    accounts, goldId: gold?.id || null, goldBalance, cashBalance, bankBalance,
    levels: { master: cashBalance + goldBalance, masterCash: cashBalance, masterGold: goldBalance, branch: bankBalance, hq: remittedHQ, debtHQ },
    hasDraft,
  }
}

// Месячный отчёт кассы (как Excel «месяц»): по каждому дню продажи/долг/проверка/ЗП/расходы + итоги.
export async function cashReport(orgId: string, from: string, to: string) {
  const sales = await sqlClient`
    select d.date::text as "day", coalesce(sum(o.paid_cash),0)::float cash, coalesce(sum(o.paid_kaspi),0)::float kaspi,
      coalesce(sum(o.paid_qr),0)::float qr, coalesce(sum(t.total),0)::float sold, count(*)::int cnt
    from orders o
    join documents d on d.id=o.linked_doc_id and d.status<>'cancelled' and d.date between ${from} and ${to}
    join (select card_id, sum(qty*price) total from order_positions group by card_id) t on t.card_id=o.id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
    group by d.date
  ` as unknown as Array<any>
  const exps = await sqlClient`
    with rr as (
      select r.date, r.article, (select coalesce(sum(a.amount),0) from fin_row_amounts a where a.row_id=r.id) tot
      from fin_rows r where r.org_id=${orgId} and r.type<>'mv' and r.date between ${from} and ${to}
    )
    select date::text as "day",
      coalesce(sum(case when article='ЗП' and tot<0 then -tot else 0 end),0)::float salary,
      coalesce(sum(case when article<>'ЗП' and tot<0 then -tot else 0 end),0)::float as "current"
    from rr group by date
  ` as unknown as Array<any>
  // Возврат по дням: сумма возвратных накладных (return_in) филиала.
  const rets = await sqlClient`
    select date::text as "day", coalesce(sum(total),0)::float ret from documents
    where org_id=${orgId} and type='return_in' and status<>'cancelled' and date between ${from} and ${to}
    group by date
  ` as unknown as Array<any>
  // Себестоимость по дням (для маржи = отпуск − себестоимость, price_in товара).
  const costs = await sqlClient`
    select d.date::text as "day", coalesce(sum(op.qty * coalesce(p.price_in,0)),0)::float cost
    from orders o
    join documents d on d.id=o.linked_doc_id and d.status<>'cancelled' and d.date between ${from} and ${to}
    join order_positions op on op.card_id=o.id
    left join products p on p.id=op.product_id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
    group by d.date
  ` as unknown as Array<any>
  const costByDay: Record<string, number> = {}; for (const c of costs) costByDay[c.day] = num(c.cost)
  const retByDay: Record<string, number> = {}; for (const r of rets) retByDay[r.day] = num(r.ret)

  const byDay: Record<string, any> = {}
  const ensure = (day: string) => (byDay[day] = byDay[day] || { day, cash: 0, kaspi: 0, qr: 0, sold: 0, cnt: 0, salary: 0, current: 0 })
  for (const s of sales) { const r = ensure(s.day); r.cash = num(s.cash); r.kaspi = num(s.kaspi); r.qr = num(s.qr); r.sold = num(s.sold); r.cnt = num(s.cnt) }
  for (const e of exps) { const r = ensure(e.day); r.salary = num(e.salary); r.current = num(e.current) }

  // ── Остатки по счетам нарастающим ─────────────────────────────────────────────
  // Движения счёта = продажи/возвраты (payments) + «Деньги» (fin_row_amounts, вкл. переводы).
  const accounts = await sqlClient`select id::text id, name from cash_accounts where org_id=${orgId} and archived=false order by sort_order, name` as unknown as Array<any>
  const payMoves = await sqlClient`
    select cash_account_id::text acc, date::text as "day", coalesce(sum(case when direction='in' then amount else -amount end),0)::float net
    from payments where org_id=${orgId} and cash_account_id is not null and date between ${from} and ${to} group by cash_account_id, date
  ` as unknown as Array<any>
  const finMoves = await sqlClient`
    select a.account_id::text acc, r.date::text as "day", coalesce(sum(a.amount),0)::float net
    from fin_rows r join fin_row_amounts a on a.row_id=r.id
    where r.org_id=${orgId} and r.date between ${from} and ${to} group by a.account_id, r.date
  ` as unknown as Array<any>
  // Стартовый остаток на начало периода = все движения по счёту ДО from (авто из истории).
  const payOpen = await sqlClient`
    select cash_account_id::text acc, coalesce(sum(case when direction='in' then amount else -amount end),0)::float net
    from payments where org_id=${orgId} and cash_account_id is not null and date < ${from} group by cash_account_id
  ` as unknown as Array<any>
  const finOpen = await sqlClient`
    select a.account_id::text acc, coalesce(sum(a.amount),0)::float net
    from fin_rows r join fin_row_amounts a on a.row_id=r.id where r.org_id=${orgId} and r.date < ${from} group by a.account_id
  ` as unknown as Array<any>
  const opening: Record<string, number> = {}; for (const a of accounts) opening[a.id] = 0
  for (const r of [...payOpen, ...finOpen]) opening[r.acc] = (opening[r.acc] || 0) + num(r.net)
  const movByDay: Record<string, Record<string, number>> = {}
  for (const r of [...payMoves, ...finMoves]) { (movByDay[r.day] = movByDay[r.day] || {})[r.acc] = (movByDay[r.day][r.acc] || 0) + num(r.net) }
  const movDays = Object.keys(movByDay).sort()

  const days = Object.values(byDay).map((r: any) => {
    const paid = r.cash + r.kaspi + r.qr
    const debt = Math.max(0, r.sold - paid)
    const cost = costByDay[r.day] || 0, ret = retByDay[r.day] || 0
    const margin = r.sold - cost                         // маржа = отпуск − себестоимость
    const split60 = margin * 0.6, split40 = margin * 0.4
    // Остаток каждого счёта на конец дня = стартовый + все движения по датам ≤ этот день.
    const bal: Record<string, number> = { ...opening }
    for (const md of movDays) { if (md <= r.day) { const mm = movByDay[md]; for (const acc in mm) bal[acc] = (bal[acc] || 0) + mm[acc] } }
    return { ...r, ret, cost, margin, split60, split40, zpPlus40: r.salary + split40, bal, debt, expense: r.salary + r.current, ok: Math.abs((paid + debt) - r.sold) < 1 }
  }).sort((a: any, b: any) => a.day.localeCompare(b.day))

  const totals = days.reduce((t: any, d: any) => ({
    cash: t.cash + d.cash, kaspi: t.kaspi + d.kaspi, qr: t.qr + d.qr, debt: t.debt + d.debt,
    sold: t.sold + d.sold, ret: t.ret + d.ret, margin: t.margin + d.margin, split60: t.split60 + d.split60, split40: t.split40 + d.split40, zpPlus40: t.zpPlus40 + d.zpPlus40,
    salary: t.salary + d.salary, current: t.current + d.current, expense: t.expense + d.expense, cnt: t.cnt + d.cnt,
  }), { cash: 0, kaspi: 0, qr: 0, debt: 0, sold: 0, ret: 0, margin: 0, split60: 0, split40: 0, zpPlus40: 0, salary: 0, current: 0, expense: 0, cnt: 0 })
  // Итоговый остаток на конец периода по каждому счёту.
  const endBal: Record<string, number> = { ...opening }
  for (const md in movByDay) for (const acc in movByDay[md]) endBal[acc] = (endBal[acc] || 0) + movByDay[md][acc]
  return { from, to, days, totals, accounts, opening, endBal, ok: days.every((d: any) => d.ok) }
}

export interface ExpenseInput { kind: 'salary' | 'current'; who?: string; article?: string; expenseArticleId?: string; accountId: string; amount: number; date: string }

export async function addShiftExpense(orgId: string, input: ExpenseInput, _actor?: Session | null) {
  if (!input.accountId || !(num(input.amount) > 0)) return { ok: false as const, error: 'Укажите счёт и сумму' }
  const article = input.kind === 'salary' ? 'ЗП' : (input.article || 'Текущий расход')
  return saveFinRow(orgId, { date: input.date, type: 'etc', article, who: input.who || '', expenseArticleId: input.expenseArticleId || null, amounts: [{ accountId: input.accountId, amount: -Math.abs(num(input.amount)) }] })
}

// Оплатить ЗП списком (разом): по каждому сотруднику с суммой>0 — расходная строка ЗП с одного счёта.
export async function payWages(orgId: string, accountId: string, items: Array<{ who: string; amount: number }>, date: string, _actor?: Session | null) {
  if (!accountId) return { ok: false as const, error: 'Выберите счёт списания' }
  const use = (items || []).filter(i => num(i.amount) > 0)
  if (!use.length) return { ok: false as const, error: 'Укажите суммы ЗП' }
  let total = 0
  for (const i of use) { await saveFinRow(orgId, { date, type: 'etc', article: 'ЗП', who: i.who || '', amounts: [{ accountId, amount: -Math.abs(num(i.amount)) }] }); total += Math.abs(num(i.amount)) }
  return { ok: true as const, count: use.length, total }
}

// Инкассация «мастер → филиал»: нал + KASPI GOLD мастера → Банковский счёт филиала (проведённый mv).
export async function incassate(orgId: string, cash: number, kaspi: number, date: string, _actor?: Session | null) {
  const c = Math.max(0, num(cash)), k = Math.max(0, num(kaspi))
  if (c + k <= 0) return { ok: false as const, error: 'Укажите сумму инкассации' }
  const fd = await financeDay(orgId, date)
  const gold = findAcc(fd.accounts || [], 'KASPI GOLD'), cashA = findAcc(fd.accounts || [], 'Основная касса'), bank = findAcc(fd.accounts || [], 'Банковский счет')
  if (!bank) return { ok: false as const, error: 'Не найден Банковский счёт' }
  const amounts: any[] = [{ accountId: bank.id, amount: c + k }]
  if (c > 0 && cashA) amounts.push({ accountId: cashA.id, amount: -c })
  if (k > 0 && gold) amounts.push({ accountId: gold.id, amount: -k })
  const r: any = await saveFinRow(orgId, { date, type: 'mv', article: 'Инкассация: мастер → филиал', amounts })
  if (r?.id) { const fin = await import('../repositories/fin.repo'); await fin.setPosted([r.id]) }
  return { ok: true as const, cash: c, kaspi: k }
}
// Сдать головному «филиал → головной»: платёж поставщику (мост) с Банковского счёта → закрывает долг.
export async function remitToHQ(orgId: string, amount: number, date: string, actor?: Session | null) {
  const amt = Math.abs(num(amount))
  if (!(amt > 0)) return { ok: false as const, error: 'Укажите сумму' }
  const bridge = (await sqlClient`select c.id::text id from contragents c join organizations o on o.id=c.org_ref_id and o.kind='hq' where c.org_id=${orgId} limit 1` as unknown as Array<any>)[0]
  if (!bridge) return { ok: false as const, error: 'Не найден контрагент-головной' }
  const fd = await financeDay(orgId, date)
  const bank = findAcc(fd.accounts || [], 'Банковский счет')
  const { randomUUID } = await import('crypto')
  const payRepo = await import('../repositories/payment.repo')
  await payRepo.insertPayment({ id: randomUUID(), orgId, contragentId: bridge.id, direction: 'out', amount: String(amt), date, cashAccountId: bank?.id || null, comment: `Инкассация головному${actor?.name ? ' · ' + actor.name : ''}` } as any)
  return { ok: true as const, amount: amt }
}

export async function closeMasterShift(orgId: string, date: string, actor?: Session | null) {
  return postFinDay(orgId, date, actor?.id)
}
