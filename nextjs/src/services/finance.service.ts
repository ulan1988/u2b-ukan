import * as finRepo from '../repositories/finance.repo'

// Финансовая сводка: дебиторка/кредиторка, касса, стоимость склада + по контрагентам.
export async function summary(orgId: string) {
  const [t, rows] = await Promise.all([finRepo.totals(orgId), finRepo.contragentBalances(orgId)])

  // Нач. остатки из актов сверки (импорт из 1С): + нам должны, − мы должны.
  const openIn = rows.reduce((s, c) => s + Math.max(0, c.opening || 0), 0)
  const openOut = rows.reduce((s, c) => s + Math.max(0, -(c.opening || 0)), 0)
  const receivable = openIn + t.sales - t.ret_in - t.pay_in       // дебиторка: нач.остаток + продажи − возвраты покупателя − оплаты от них
  const payable = openOut + t.purchases - t.ret_out - t.pay_out    // кредиторка: нач.остаток + закупы − возвраты поставщику − оплаты им
  const cash = t.pay_in - t.pay_out                       // движение денег через кассу/банк

  const contragents = rows.map(c => {
    const op = c.opening || 0
    return {
      id: c.id, name: c.name, kind: c.kind,
      theyOwe: (op > 0 ? op : 0) + c.sales - c.ret_in - c.pay_in,     // нам должны (+ нач.остаток)
      weOwe: (op < 0 ? -op : 0) + c.purchases - c.ret_out - c.pay_out, // мы должны (+ нач.остаток)
    }
  }).filter(c => Math.abs(c.theyOwe) > 0.001 || Math.abs(c.weOwe) > 0.001)

  return { receivable, payable, cash, stockValue: t.stock_value, contragents }
}

// Выписка по одному контрагенту для его кабинета: долг + операции (продажи,
// ВОЗВРАТЫ отдельной строкой со знаком «−», оплаты). Чтобы контрагент видел,
// что возврат уменьшил его долг.
export async function contragentLedger(orgId: string, contragentId: string, opening = 0) {
  const [docs, pays] = await Promise.all([
    finRepo.contragentDocs(orgId, contragentId),
    finRepo.contragentPayments(orgId, contragentId),
  ])
  const sum = (t: string) => docs.filter(d => d.type === t).reduce((s, d) => s + d.total, 0)
  const payIn = pays.filter(p => p.direction === 'in').reduce((s, p) => s + p.amount, 0)
  const payOut = pays.filter(p => p.direction === 'out').reduce((s, p) => s + p.amount, 0)
  const sales = sum('sale'), purchases = sum('purchase'), retIn = sum('return_in'), retOut = sum('return_out')
  const theyOwe = (opening > 0 ? opening : 0) + sales - retIn - payIn      // их долг нам
  const weOwe = (opening < 0 ? -opening : 0) + purchases - retOut - payOut // мы им должны

  // Операции для выписки. sign: '+' увеличивает их долг нам, '−' уменьшает.
  const meta: Record<string, { label: string; sign: '+' | '-' }> = {
    sale: { label: 'Продажа вам', sign: '+' },
    return_in: { label: '↩ Возврат от вас', sign: '-' },
    purchase: { label: 'Ваша поставка нам', sign: '-' },
    return_out: { label: '↩ Возврат вам', sign: '+' },
  }
  const txns = [
    ...docs.map(d => ({ id: d.id, date: d.date, kind: d.type, label: meta[d.type]?.label || d.type, number: d.number, amount: d.total, sign: meta[d.type]?.sign || '+' })),
    ...pays.map(p => ({ id: p.id, date: p.date, kind: 'payment', label: p.direction === 'in' ? 'Оплата от вас' : 'Оплата вам', number: '', amount: p.amount, sign: p.direction === 'in' ? '-' : '+' as '+' | '-' })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  return {
    configured: true, currency: '₸',
    debt: theyOwe, weOwe, paid: payIn, balance: theyOwe,
    accrued: (opening > 0 ? opening : 0) + sales, returns: retIn,
    transactions: txns,
  }
}

// Рентабельность: по каждой продаже выручка − себестоимость = прибыль, маржа %.
export async function profit(orgId: string) {
  const rows = await finRepo.profitReport(orgId)
  const sales = rows.map(r => {
    const profit = r.revenue - r.cost
    return {
      id: r.id, number: r.number, date: r.date, client: r.client || '—',
      revenue: r.revenue, cost: r.cost, profit,
      margin: r.revenue > 0 ? (profit / r.revenue) * 100 : 0,
    }
  })
  const revenue = sales.reduce((s, x) => s + x.revenue, 0)
  const cost = sales.reduce((s, x) => s + x.cost, 0)
  const totalProfit = revenue - cost
  return {
    sales,
    totals: { revenue, cost, profit: totalProfit, margin: revenue > 0 ? (totalProfit / revenue) * 100 : 0 },
  }
}
