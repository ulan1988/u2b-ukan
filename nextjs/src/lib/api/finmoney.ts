// Клиент листа «Деньги».
import { getObj, post, patch } from './http'

export const finDay = (date: string) => getObj<any>(`/api/finance/money?date=${date}`, null as any)
export const finSaveRow = (row: any) => post('/api/finance/money', { action: 'save', row })
export const finDeleteRow = (id: string) => post('/api/finance/money', { action: 'delete', id })
export const finReorder = (ids: string[]) => post('/api/finance/money', { action: 'reorder', ids })
export const finPost = (date: string, rows?: any[]) => post('/api/finance/money', { action: 'post', date, rows })
export const finFavSave = (favs: any[]) => post('/api/finance/money', { action: 'favSave', favs })
export const finFavApply = (date: string) => post('/api/finance/money', { action: 'favApply', date })
export const finDocSearch = (q: string) => post('/api/finance/money', { action: 'docSearch', q })
export const finOpenInvoices = (contragentId: string, dir: string) => post('/api/finance/money', { action: 'openInvoices', contragentId, dir })
export const finJournal = (from: string, to: string) => post('/api/finance/money', { action: 'journal', from, to })
export const finLedger = (from: string, to: string) => post('/api/finance/money', { action: 'ledger', from, to })
export const finEditDoc = (id: string, row: any) => post('/api/finance/money', { action: 'editDoc', id, row })
export const finDeleteDoc = (id: string) => post('/api/finance/money', { action: 'deleteDoc', id })
export const finFavList = () => post('/api/finance/money', { action: 'favList' })
export const finDds = (from: string, to: string) => getObj<any>(`/api/finance/dds?from=${from}&to=${to}`, null as any)
export const finAccounts = () => getObj<any>(`/api/finance/accounts`, null as any)
export const finExpList = () => post('/api/finance/money', { action: 'expList' })
export const finExpSave = (items: any[]) => post('/api/finance/money', { action: 'expSave', items })

// Касса дня (смена филиала на десктопе): орг выбирается явно.
export const cashDay = (orgId: string, date: string) => getObj<any>(`/api/finance/shift?orgId=${orgId}&date=${date}`, null as any)
export const cashExpense = (orgId: string, body: { kind: 'salary' | 'current'; who?: string; article?: string; expenseArticleId?: string; accountId: string; amount: number; date: string }) => post('/api/finance/shift', { orgId, ...body })
export const cashIncassate = (orgId: string, cash: number, kaspi: number, date: string) => post('/api/finance/shift', { orgId, action: 'incassate', cash, kaspi, date })
export const cashRemit = (orgId: string, cash: number, kaspi: number, date: string) => post('/api/finance/shift', { orgId, action: 'remit', cash, kaspi, date })
export const cashRemitUndo = (orgId: string, date: string) => post('/api/finance/shift', { orgId, action: 'remitUndo', date })
// Оплата из кабинета клиента: принять / отказать (отказ удаляет платёж).
export const reviewClientPayment = (paymentId: string, accept: boolean) => post('/api/finance/money', { action: 'payReview', paymentId, accept })
// Возврат денег от головного на счёт филиала (одно действие: счёт + сумма) и его отмена за день.
export const cashReturnHQ = (orgId: string, accountId: string, amount: number, date: string) => post('/api/finance/shift', { orgId, action: 'returnHQ', accountId, amount, date })
export const cashReturnUndo = (orgId: string, date: string) => post('/api/finance/shift', { orgId, action: 'returnUndo', date })
export const cashWages = (orgId: string, accountId: string, items: Array<{ who: string; amount: number }>, date: string) => post('/api/finance/shift', { orgId, action: 'wages', accountId, items, date })
// Табель: сохранить отметки «кто на смене» за день (начисление, деньги не трогаются).
export const cashTabelSet = (orgId: string, ids: string[], date: string) => post('/api/finance/shift', { orgId, action: 'tabelSet', ids, date })
// Выплата ЗП+40% отмеченным: оклад (табель) + бонус (админ делит 40% вручную), пишет fin_rows posted.
// splits — с каких счетов и сколько снять (отмеченные птичкой); пусто → всё с accountId.
export const cashPayZp = (orgId: string, accountId: string, date: string, bonuses: Array<{ employeeId: string; amount: number }>, splits?: Array<{ accountId: string; amount: number }>) => post('/api/finance/shift', { orgId, action: 'payZp', accountId, date, bonuses, splits })
export const cashCloseShift = (orgId: string, date: string) => post('/api/finance/shift', { orgId, action: 'close', date })
export const cashMonth = (orgId: string, from: string, to: string) => getObj<any>(`/api/finance/shift?mode=month&orgId=${orgId}&from=${from}&to=${to}`, null as any)
// Отмена проведения: ручная строка (сторно платежа → черновик) и авто-строка (удаление платежа).
export const finUnpostRow = (id: string) => post('/api/finance/money', { action: 'unpost', id })
export const finCancelPayment = (paymentId: string) => post('/api/finance/money', { action: 'cancelPay', paymentId })
// Прибыль дня магазина: расчёт деления денег (себестоимость / наценка) и проводка.
export const profitDay = (orgId: string, date: string) => getObj<any>(`/api/finance/profit-day?orgId=${orgId}&date=${date}`, null as any)
export const profitPost = (orgId: string, date: string) => post('/api/finance/profit-day', { orgId, date, action: 'post' })
export const profitUnpost = (orgId: string, date: string) => post('/api/finance/profit-day', { orgId, date, action: 'unpost' })
// Бонусы дня (товар соседа): заработок магазина и доля головного.
export const bonusDay = (orgId: string, date: string) => getObj<any>(`/api/finance/bonus-day?orgId=${orgId}&date=${date}`, null as any)

// Платежи одной ячейки авто-строки + правка суммы платежа (двигает и вторую сторону).
export const finCellPayments = (date: string, accountId: string, contragentId?: string | null) =>
  getObj<any>(`/api/finance/payment?date=${date}&accountId=${accountId}${contragentId ? `&contragentId=${contragentId}` : ''}`, null as any)
export const finEditPayment = (id: string, amount: number) => patch('/api/finance/payment', { id, amount })
// Внести платёж вручную в строку листа (контрагент сам не отправил деньги).
export const finAddPayment = (b: { date: string; accountId: string; contragentId: string; amount: number; direction?: string; comment?: string }) =>
  post('/api/finance/payment', b)
