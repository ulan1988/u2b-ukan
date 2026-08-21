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
  const cards = await sqlClient`
    select o.id, o.payment, o.paid_cash::float "paidCash", o.paid_kaspi::float "paidKaspi", o.paid_qr::float "paidQr", t.total::float total, c.name customer
    from orders o
    join documents d on d.id = o.linked_doc_id and d.date=${date} and d.status<>'cancelled'
    join (select card_id, sum(qty*price) total from order_positions group by card_id) t on t.card_id = o.id
    left join contragents c on c.id = o.contact_id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
    order by o.updated_at desc
  ` as unknown as Array<any>

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

  // Остаток KASPI GOLD (личный сбор мастера, накопительно): все оплаты каспи − переводы в банк.
  const gold = findAcc(fd.accounts || [], 'KASPI GOLD')
  let goldBalance = 0
  if (gold) {
    const gp = (await sqlClient`select coalesce(sum(case when direction='in' then amount else -amount end),0)::float v from payments where org_id=${orgId} and cash_account_id=${gold.id}` as unknown as Array<any>)[0]
    const gf = (await sqlClient`select coalesce(sum(a.amount),0)::float v from fin_row_amounts a join fin_rows r on r.id=a.row_id where r.org_id=${orgId} and r.status='posted' and a.account_id=${gold.id}` as unknown as Array<any>)[0]
    goldBalance = num(gp.v) + num(gf.v)
  }

  return {
    date, income, check, cards,
    stock: { amount: num(stkRow.amount), qty: num(stkRow.qty) },
    expenses: { rows: expRows, salaryTotal, currentTotal, total: salaryTotal + currentTotal },
    accounts, goldId: gold?.id || null, goldBalance, hasDraft,
  }
}

export interface ExpenseInput { kind: 'salary' | 'current'; who?: string; article?: string; accountId: string; amount: number; date: string }

export async function addShiftExpense(orgId: string, input: ExpenseInput, _actor?: Session | null) {
  if (!input.accountId || !(num(input.amount) > 0)) return { ok: false as const, error: 'Укажите счёт и сумму' }
  const article = input.kind === 'salary' ? 'ЗП' : (input.article || 'Текущий расход')
  return saveFinRow(orgId, { date: input.date, type: 'etc', article, who: input.who || '', amounts: [{ accountId: input.accountId, amount: -Math.abs(num(input.amount)) }] })
}

// Перевод личного KASPI GOLD → Банковский счёт (мастер сдаёт собранное в банк). Проведённый.
export async function transferGoldToBank(orgId: string, amount: number, date: string, _actor?: Session | null) {
  const amt = Math.abs(num(amount))
  if (!(amt > 0)) return { ok: false as const, error: 'Укажите сумму' }
  const fd = await financeDay(orgId, date)
  const gold = findAcc(fd.accounts || [], 'KASPI GOLD'), bank = findAcc(fd.accounts || [], 'Банковский счет')
  if (!gold || !bank) return { ok: false as const, error: 'Не найдены счета KASPI GOLD / Банковский счёт' }
  const r: any = await saveFinRow(orgId, { date, type: 'mv', article: 'Перевод GOLD → банк', amounts: [{ accountId: gold.id, amount: -amt }, { accountId: bank.id, amount: amt }] })
  if (r?.id) { const fin = await import('../repositories/fin.repo'); await fin.setPosted([r.id]) }
  return { ok: true as const, amount: amt }
}

export async function closeMasterShift(orgId: string, date: string, actor?: Session | null) {
  return postFinDay(orgId, date, actor?.id)
}
