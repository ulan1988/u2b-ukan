// Домен: ERP-документы (приход/расход/возвраты/оплаты/производство).
import { getArray, post } from './http'

export const listPurchases = (orgId: string) => getArray(`/api/documents?orgId=${orgId}`)
export const createPurchase = (b: any) => post('/api/documents', b)

export const listSales = (orgId: string) => getArray(`/api/sales?orgId=${orgId}`)
export const createSale = (b: any) => post('/api/sales', b)

export const listReturns = (orgId: string) => getArray(`/api/returns?orgId=${orgId}`)
export const createReturn = (kind: 'in' | 'out', b: any) => post(`/api/returns?kind=${kind}`, b)

export const listPayments = (orgId: string) => getArray(`/api/payments?orgId=${orgId}`)
export const createPayment = (b: any) => post('/api/payments', b)

export const listProduction = (orgId: string) => getArray(`/api/production?orgId=${orgId}`)
export const createProduction = (b: any) => post('/api/production', b)

export const cancelDocument = (id: string) => post(`/api/documents/${id}/cancel`)
