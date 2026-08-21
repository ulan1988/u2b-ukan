// Смена мастера за день: доходы (продажи нал/каспи/долг), производство в запас,
// расходы (ЗП + текущие — через модуль «Деньги»/fin_rows), итог по счетам, закрытие.
import { sqlClient } from '../lib/db'
import { financeDay, saveFinRow, postFinDay } from './finmoney.service'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0

export async function masterShift(orgId: string, date: string) {
  // Доходы: проданные карточки — по дате их расходной накладной (локальный день, как today()).
  const incRow = (await sqlClient`
    select coalesce(sum(o.paid_cash),0)::float cash, coalesce(sum(o.paid_kaspi),0)::float kaspi,
      coalesce(sum(t.total),0)::float total
    from orders o
    join documents d on d.id = o.linked_doc_id and d.date=${date} and d.status<>'cancelled'
    join (select card_id, sum(qty*price) total from order_positions group by card_id) t on t.card_id = o.id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
  ` as unknown as Array<any>)[0] || { cash: 0, kaspi: 0, total: 0 }
  const cards = await sqlClient`
    select o.id, o.payment, o.paid_cash::float "paidCash", o.paid_kaspi::float "paidKaspi", t.total::float total, c.name customer
    from orders o
    join documents d on d.id = o.linked_doc_id and d.date=${date} and d.status<>'cancelled'
    join (select card_id, sum(qty*price) total from order_positions group by card_id) t on t.card_id = o.id
    left join contragents c on c.id = o.contact_id
    where o.org_id=${orgId} and o.prod_phase='sold' and o.is_cancelled=false
    order by o.updated_at desc
  ` as unknown as Array<any>

  // Производство в запас за день (документы production, строки output).
  const stkRow = (await sqlClient`
    select coalesce(sum(dl.amount),0)::float amount, coalesce(sum(dl.qty),0)::float qty
    from documents d join document_lines dl on dl.document_id = d.id
    where d.org_id=${orgId} and d.type='production' and d.status<>'cancelled' and d.date=${date} and dl.role='output'
  ` as unknown as Array<any>)[0] || { amount: 0, qty: 0 }

  // Расходы: строки «Денег» за день с отрицательной суммой (ЗП по article='ЗП', прочее — текущие).
  const fd = await financeDay(orgId, date)
  const expRows = (fd.rows || []).map((r: any) => ({ ...r, amt: (r.amounts || []).reduce((s: number, a: any) => s + num(a.amount), 0) })).filter((r: any) => r.amt < 0)
  const salaryTotal = expRows.filter((r: any) => (r.article || '') === 'ЗП').reduce((s: number, r: any) => s - r.amt, 0)
  const currentTotal = expRows.filter((r: any) => (r.article || '') !== 'ЗП').reduce((s: number, r: any) => s - r.amt, 0)
  const expTotal = salaryTotal + currentTotal
  const anyDraft = (fd.rows || []).some((r: any) => r.status !== 'posted' && (r.amounts || []).some((a: any) => num(a.amount) !== 0))

  const income = { cash: num(incRow.cash), kaspi: num(incRow.kaspi), total: num(incRow.total), debt: Math.max(0, num(incRow.total) - num(incRow.cash) - num(incRow.kaspi)) }
  return {
    date, income, cards,
    stock: { amount: num(stkRow.amount), qty: num(stkRow.qty) },
    expenses: { rows: expRows, salaryTotal, currentTotal, total: expTotal },
    accounts: fd.accounts, opening: fd.opening, closing: fd.closing, hasDraft: anyDraft,
  }
}

export interface ExpenseInput { kind: 'salary' | 'current'; who?: string; article?: string; accountId: string; amount: number; date: string }

export async function addShiftExpense(orgId: string, input: ExpenseInput, _actor?: Session | null) {
  if (!input.accountId || !(num(input.amount) > 0)) return { ok: false as const, error: 'Укажите счёт и сумму' }
  const article = input.kind === 'salary' ? 'ЗП' : (input.article || 'Текущий расход')
  return saveFinRow(orgId, { date: input.date, type: 'etc', article, who: input.who || '', amounts: [{ accountId: input.accountId, amount: -Math.abs(num(input.amount)) }] })
}

export async function closeMasterShift(orgId: string, date: string, actor?: Session | null) {
  return postFinDay(orgId, date, actor?.id)
}
