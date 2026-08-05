// Домен: справочники (организации, товары, контрагенты, склады, кассы, остаток).
import { getArray, getObj, post, patch } from './http'

export const fetchRefs = () => getObj('/api/refs')       // { organizations, products, contragents, warehouses, cashAccounts }

export const listProducts = (all = false) => getArray(`/api/products${all ? '?all=1' : ''}`)
export const addProduct = (b: any) => post('/api/products', b)
export const editProduct = (id: string, b: any) => patch(`/api/products/${id}`, b)

export const listContragents = (all = false) => getArray(`/api/contragents${all ? '?all=1' : ''}`)
export const addContragent = (b: any) => post('/api/contragents', b)
export const editContragent = (id: string, b: any) => patch(`/api/contragents/${id}`, b)

export const addWarehouse = (b: any) => post('/api/warehouses', b)
export const addCashAccount = (b: any) => post('/api/cash-accounts', b)

export const stock = (orgId: string, warehouseId: string) => getArray(`/api/stock?orgId=${orgId}&warehouseId=${warehouseId}`)

export const settings = (orgId: string) => getObj(`/api/settings?orgId=${orgId}`, { suppliers: [], projects: [], specProjects: [] })
