import * as finRepo from '../repositories/finance.repo'

// Финансовая сводка: дебиторка/кредиторка, касса, стоимость склада + по контрагентам.
export async function summary(orgId: string) {
  const [t, rows] = await Promise.all([finRepo.totals(orgId), finRepo.contragentBalances(orgId)])

  const receivable = t.sales - t.pay_in      // дебиторка: клиенты должны нам
  const payable = t.purchases - t.pay_out    // кредиторка: мы должны поставщикам
  const cash = t.pay_in - t.pay_out          // движение денег через кассу/банк

  const contragents = rows.map(c => ({
    id: c.id, name: c.name, kind: c.kind,
    theyOwe: c.sales - c.pay_in,             // нам должны
    weOwe: c.purchases - c.pay_out,          // мы должны
  })).filter(c => Math.abs(c.theyOwe) > 0.001 || Math.abs(c.weOwe) > 0.001)

  return { receivable, payable, cash, stockValue: t.stock_value, contragents }
}
