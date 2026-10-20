// Домен: ERP-документы (приход/расход/возвраты/оплаты/производство).
import { getArray, getObj, post, patch, send } from './http'

export const listPurchases = (orgId: string) => getArray(`/api/documents?orgId=${orgId}`)
export const createPurchase = (b: any) => post('/api/documents', b)
// Удалить ошибочную позицию из проведённой накладной (склад/итог пересчитываются).
export const deleteInvoiceLine = (docId: string, lineId: string) => send(`/api/documents/${docId}/line?lineId=${encodeURIComponent(lineId)}`, 'DELETE')
export const getDocument = (id: string) => getObj(`/api/documents/${id}`, null as any)
export const docChain = (id: string) => getObj(`/api/documents/${id}/chain`, null as any)
export const updateDocument = (id: string, b: any) => patch(`/api/documents/${id}`, b)

export const listSales = (orgId: string) => getArray(`/api/sales?orgId=${orgId}`)
export const createSale = (b: any) => post('/api/sales', b)

export const listReturns = (orgId: string) => getArray(`/api/returns?orgId=${orgId}`)
export const createReturn = (kind: 'in' | 'out', b: any) => post(`/api/returns?kind=${kind}`, b)

export const listPayments = (orgId: string) => getArray(`/api/payments?orgId=${orgId}`)
export const createPayment = (b: any) => post('/api/payments', b)

export const listProduction = (orgId: string) => getArray(`/api/production?orgId=${orgId}`)
export const createProduction = (b: any) => post('/api/production', b)

export const listTransfers = (orgId: string) => getArray(`/api/transfer?orgId=${orgId}`)
export const createTransfer = (b: any) => post('/api/transfer', b)

export const cancelDocument = (id: string) => post(`/api/documents/${id}/cancel`)
