// Прибыль дня (магазин Кристалл). Чек делится на две части ДЕНЕГ:
//   «Оплата от покупателей» = себестоимость товара, «Прочие доходы» = наценка.
// Накладная не трогается — делим только поступившие деньги.
// Правила (утверждены владельцем 06.11.2026):
//  • прибыль признаём ПО ДЕНЬГАМ: оплатили часть чека — столько же доли прибыли;
//    погасили долг позже — прибыль попадёт в день погашения;
//  • счёт прибыли — тот, куда реально пришли деньги по этой накладной (нал → касса, QR → банк);
//  • возврат — минусом в день выплаты денег, на тот счёт, с которого вернули;
//  • позиции без закупочной цены считаются нулевой себестоимостью и помечаются (⚠):
//    головной впишет цену в приходной — пересчитать и провести заново.
import * as repo from '../repositories/profit.repo'

const num = (n: any) => Number(n) || 0
const r2 = (n: number) => Math.round(n * 100) / 100

export interface ProfitLine {
  paymentId: string; docId: string; docNumber: string; cardId: string | null
  kind: 'sale' | 'return'; contragent: string
  accountId: string | null; accountName: string
  paid: number; docTotal: number; docCost: number; nocost: number
  cost: number; profit: number
}

// Расчёт дня: по каждому платежу — какая часть денег себестоимость, какая прибыль.
export async function profitDay(orgId: string, date: string) {
  const [pays, posted] = await Promise.all([repo.dayPayments(orgId, date), repo.rowsForDay(orgId, date)])
  const lines: ProfitLine[] = []
  for (const p of pays) {
    const total = num(p.docTotal), cost = num(p.docCost), amount = num(p.amount)
    // Доля оплаты в документе: частичная оплата → частичная прибыль.
    const share = total > 0 ? Math.min(1, amount / total) : 0
    const sign = p.kind === 'return' ? -1 : 1
    const costPart = r2(cost * share) * sign
    const profit = r2(amount * sign) - costPart
    lines.push({
      paymentId: p.paymentId, docId: p.docId, docNumber: p.docNumber || '', cardId: p.cardId || null,
      kind: p.kind, contragent: p.contragent || '',
      accountId: p.accountId || null, accountName: p.accountName || '—',
      paid: r2(amount * sign), docTotal: total, docCost: cost, nocost: Number(p.nocost) || 0,
      cost: costPart, profit: r2(profit),
    })
  }
  // Свод по счетам: куда легла прибыль.
  const byAcc = new Map<string, { accountId: string | null; accountName: string; paid: number; cost: number; profit: number }>()
  for (const l of lines) {
    const k = l.accountId || 'none'
    const g = byAcc.get(k) || { accountId: l.accountId, accountName: l.accountName, paid: 0, cost: 0, profit: 0 }
    g.paid = r2(g.paid + l.paid); g.cost = r2(g.cost + l.cost); g.profit = r2(g.profit + l.profit)
    byAcc.set(k, g)
  }
  const totals = lines.reduce((s, l) => ({
    paid: r2(s.paid + l.paid), cost: r2(s.cost + l.cost), profit: r2(s.profit + l.profit),
  }), { paid: 0, cost: 0, profit: 0 })
  const nocostLines = lines.filter(l => l.nocost > 0)
  return {
    date, lines, byAccount: Array.from(byAcc.values()), totals,
    posted: posted.length > 0,
    postedSum: r2(posted.reduce((s: number, r: any) => s + num(r.amount), 0)),
    warn: { count: nocostLines.length, docs: nocostLines.map(l => l.docNumber), profit: r2(nocostLines.reduce((s, l) => s + l.profit, 0)) },
  }
}

// Провести прибыль дня: один «документ» = набор строк по накладным. Пере-проведение
// (после правки чека или цены от головного) просто перезаписывает день.
export async function postProfitDay(orgId: string, date: string) {
  const calc = await profitDay(orgId, date)
  const vals = calc.lines.filter(l => Math.abs(l.profit) >= 0.01).map(l => ({
    orgId, date, docId: l.docId, cardId: l.cardId, paymentId: l.paymentId,
    accountId: l.accountId, amount: String(l.profit), noCost: l.nocost > 0, status: 'posted',
  }))
  await repo.deleteDay(orgId, date)
  await repo.insertRows(vals as any)
  return { ok: true as const, count: vals.length, profit: calc.totals.profit, byAccount: calc.byAccount }
}

export async function unpostProfitDay(orgId: string, date: string) {
  await repo.deleteDay(orgId, date)
  return { ok: true as const }
}
