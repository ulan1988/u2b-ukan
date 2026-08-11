// Домен: справочники (организации, товары, контрагенты, склады, кассы, остаток).
import { getArray, getObj, post, patch, send } from './http'

export const fetchRefs = () => getObj('/api/refs')       // { organizations, products, contragents, warehouses, cashAccounts }

export const listProducts = (all = false) => getArray(`/api/products${all ? '?all=1' : ''}`)
export const addProduct = (b: any) => post('/api/products', b)
export const editProduct = (id: string, b: any) => patch(`/api/products/${id}`, b)
export const archiveProduct = (id: string) => patch(`/api/products/${id}`, { archived: true })

// Папки номенклатуры (динамическое дерево grp/cat/sub).
export const listFolders = () => getArray('/api/folders')
export const createFolder = (b: { grp: string; cat?: string; sub?: string }) => post('/api/folders', b)
export const renameFolder = (b: { grp: string; cat?: string; sub?: string; name: string }) => send('/api/folders', 'PATCH', b)
export const deleteFolder = (b: { grp: string; cat?: string; sub?: string }) => send('/api/folders', 'DELETE', b)
export const moveFolder = (b: { src: { grp: string; cat: string; sub: string }; dst: { grp: string; cat: string; sub: string } }) => send('/api/folders', 'PUT', b)

export const listContragents = (all = false) => getArray(`/api/contragents${all ? '?all=1' : ''}`)
// Справочник единиц измерения.
export const listUnits = () => getArray('/api/units')
export const saveUnits = (items: any[]) => post('/api/units', items)
// Акт сверки по контрагенту (нарастающее сальдо, с датами).
export const reconcile = (contragentId: string, from?: string, to?: string) =>
  getObj(`/api/finance/reconcile?contragentId=${contragentId}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`, null as any)
export const addContragent = (b: any) => post('/api/contragents', b)
export const editContragent = (id: string, b: any) => patch(`/api/contragents/${id}`, b)

export const addWarehouse = (b: any) => post('/api/warehouses', b)
export const addCashAccount = (b: any) => post('/api/cash-accounts', b)

export const stock = (orgId: string, warehouseId: string) => getArray(`/api/stock?orgId=${orgId}&warehouseId=${warehouseId}`)
export const stockOverview = (orgId: string) => getArray(`/api/stock?orgId=${orgId}&overview=1`)
export const stockMovements = (orgId: string) => getArray(`/api/stock/movements?orgId=${orgId}`)
export const stockIncome = (b: { name: string; qty: number; unit: string }) => post('/api/stock/income', b)

export const settings = (orgId: string) => getObj(`/api/settings?orgId=${orgId}`, { suppliers: [], projects: [], specProjects: [] })

export const categoryRules = (orgId: string) => getArray(`/api/settings/category-rules?orgId=${orgId}`)
export const saveCategoryRule = (b: any) => send('/api/settings/category-rules', 'PUT', b)
export const setDefaultLogist = (orgId: string, defaultLogistId: string) => send('/api/settings', 'PATCH', { orgId, defaultLogistId })
export const setDefaultContragent = (orgId: string, defaultContragentId: string) => send('/api/settings', 'PATCH', { orgId, defaultContragentId })

export const createProject = (b: any) => post('/api/projects', b)
export const createSpecProject = (b: any) => post('/api/spec-projects', b)

export const autoPrices = (productIds: string[], contragentId?: string) =>
  getObj(`/api/pricing?productIds=${productIds.join(',')}${contragentId ? `&contragentId=${contragentId}` : ''}`, {})
