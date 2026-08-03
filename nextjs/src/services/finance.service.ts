import * as finRepo from '../repositories/finance.repo'

// Финансовая сводка: дебиторка/кредиторка, касса, стоимость склада + по контрагентам.
export async function summary(orgId: string) {
  const [t, rows] = await Promise.all([finRepo.totals(orgId), finRepo.contragentBalances(orgId)])

  const receivable = t.sales - t.ret_in - t.pay_in       // дебиторка: продажи − возвраты покупателя − оплаты от них
  const payable = t.purchases - t.ret_out - t.pay_out    // кредиторка: закупы − возвраты поставщику − оплаты им
  const cash = t.pay_in - t.pay_out                       // движение денег через кассу/банк

  const contragents = rows.map(c => ({
    id: c.id, name: c.name, kind: c.kind,
    theyOwe: c.sales - c.ret_in - c.pay_in,              // нам должны
    weOwe: c.purchases - c.ret_out - c.pay_out,          // мы должны
  })).filter(c => Math.abs(c.theyOwe) > 0.001 || Math.abs(c.weOwe) > 0.001)

  return { receivable, payable, cash, stockValue: t.stock_value, contragents }
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
