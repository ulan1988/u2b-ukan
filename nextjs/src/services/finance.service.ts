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

// Акт сверки (ведомость взаиморасчётов) по контрагенту, как в 1С:
// Документ движения | Начальный остаток | Увеличение долга | Уменьшение долга | Конечный остаток.
// «+» (увеличение долга контрагента нам): продажа, возврат поставщику, оплата поставщику.
// «−» (уменьшение): приход от него, возврат от клиента, оплата от клиента.
// Начальный остаток на дату `from` = нач.остаток справочника + сумма движений ДО from.
export async function contragentReconciliation(orgId: string, contragentId: string, from?: string, to?: string) {
  const [docs, pays, opening0, byProject] = await Promise.all([
    finRepo.contragentDocs(orgId, contragentId),
    finRepo.contragentPayments(orgId, contragentId),
    finRepo.contragentOpening(orgId, contragentId),
    finRepo.contragentProjectTotals(orgId, contragentId),
  ])
  const docTitle: Record<string, string> = { sale: 'Расходная накладная', purchase: 'Приходная накладная', return_in: 'Возврат от клиента', return_out: 'Возврат поставщику' }
  const inc = (t: string) => t === 'sale' || t === 'return_out'
  const mv = [
    ...docs.map(d => ({ date: d.date, title: `${docTitle[d.type] || d.type} ${d.number}`, inc: inc(d.type) ? d.total : 0, dec: inc(d.type) ? 0 : d.total, docId: d.id as string | null, type: d.type })),
    ...pays.map(p => ({ date: p.date, title: (p.comment || '').replace('Импорт из 1С · ', '') || (p.direction === 'in' ? 'Оплата от клиента' : 'Оплата поставщику'), inc: p.direction === 'out' ? p.amount : 0, dec: p.direction === 'in' ? p.amount : 0, docId: null as string | null, type: 'pay' })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let running = opening0
  for (const m of mv) { if (from && m.date < from) running += m.inc - m.dec }
  const opening = running
  const rows: any[] = []
  let sumInc = 0, sumDec = 0
  for (const m of mv) {
    if (from && m.date < from) continue
    if (to && m.date > to) continue
    const start = running
    running += m.inc - m.dec
    sumInc += m.inc; sumDec += m.dec
    rows.push({ date: m.date, title: m.title, opening: start, inc: m.inc, dec: m.dec, balance: running, docId: m.docId, type: m.type })
  }
  return { opening, rows, totals: { opening, inc: sumInc, dec: sumDec, closing: running }, byProject, currency: '₸' }
}

// Рентабельность: по каждой продаже выручка − себестоимость = прибыль, маржа %.
// Рентабельность ПО ТОВАРУ за период: qty, выручка, себестоимость, прибыль, маржа %.
export async function profitByProduct(orgId: string, from?: string, to?: string) {
  const rows = await finRepo.profitByProduct(orgId, from, to)
  const items = rows.map(r => {
    const profit = r.revenue - r.cost
    return { id: r.id, name: r.name, qty: r.qty, revenue: r.revenue, cost: r.cost, profit, margin: r.revenue > 0 ? (profit / r.revenue) * 100 : 0 }
  })
  const revenue = items.reduce((s, x) => s + x.revenue, 0)
  const cost = items.reduce((s, x) => s + x.cost, 0)
  const profit = revenue - cost
  return { items, totals: { revenue, cost, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 } }
}

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
