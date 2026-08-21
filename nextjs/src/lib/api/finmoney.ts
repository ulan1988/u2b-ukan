// Клиент листа «Деньги».
import { getObj, post } from './http'

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
export const finEditDoc = (id: string, row: any) => post('/api/finance/money', { action: 'editDoc', id, row })
export const finDeleteDoc = (id: string) => post('/api/finance/money', { action: 'deleteDoc', id })
export const finFavList = () => post('/api/finance/money', { action: 'favList' })
export const finDds = (from: string, to: string) => getObj<any>(`/api/finance/dds?from=${from}&to=${to}`, null as any)
export const finExpList = () => post('/api/finance/money', { action: 'expList' })
export const finExpSave = (items: any[]) => post('/api/finance/money', { action: 'expSave', items })

// Касса дня (смена филиала на десктопе): орг выбирается явно.
export const cashDay = (orgId: string, date: string) => getObj<any>(`/api/finance/shift?orgId=${orgId}&date=${date}`, null as any)
export const cashExpense = (orgId: string, body: { kind: 'salary' | 'current'; who?: string; accountId: string; amount: number; date: string }) => post('/api/finance/shift', { orgId, ...body })
export const cashTransferGold = (orgId: string, amount: number, date: string) => post('/api/finance/shift', { orgId, action: 'transfer', amount, date })
export const cashCloseShift = (orgId: string, date: string) => post('/api/finance/shift', { orgId, action: 'close', date })
export const cashMonth = (orgId: string, from: string, to: string) => getObj<any>(`/api/finance/shift?mode=month&orgId=${orgId}&from=${from}&to=${to}`, null as any)
