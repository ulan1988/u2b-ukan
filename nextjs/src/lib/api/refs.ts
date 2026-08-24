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
export const hideFolder = (b: { grp: string; cat?: string; sub?: string; hidden: boolean }) => send('/api/folders', 'PATCH', b)

export const listContragents = (all = false) => getArray(`/api/contragents${all ? '?all=1' : ''}`)
// Справочник единиц измерения.
export const listUnits = () => getArray('/api/units')
export const saveUnits = (items: any[]) => post('/api/units', items)
// Акт сверки по контрагенту (нарастающее сальдо, с датами).
// Финансовая сводка по орг: дебиторка/кредиторка + долги по каждому контрагенту.
export const financeSummary = (orgId: string) =>
  getObj(`/api/finance?orgId=${orgId}`, { receivable: 0, payable: 0, cash: 0, stockValue: 0, contragents: [] as any[] })
export const reconcile = (contragentId: string, from?: string, to?: string) =>
  getObj(`/api/finance/reconcile?contragentId=${contragentId}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`, null as any)
export const addContragent = (b: any) => post('/api/contragents', b)
export const editContragent = (id: string, b: any) => patch(`/api/contragents/${id}`, b)

export const addWarehouse = (b: any) => post('/api/warehouses', b)
export const addCashAccount = (b: any) => post('/api/cash-accounts', b)

export const stock = (orgId: string, warehouseId: string) => getArray(`/api/stock?orgId=${orgId}&warehouseId=${warehouseId}`)
export const stockOverview = (orgId: string) => getArray(`/api/stock?orgId=${orgId}&overview=1`)
export const stockMovements = (orgId: string) => getArray(`/api/stock/movements?orgId=${orgId}`)
// Движение одного товара по всем накладным (приход/расход/возвраты) — «Движение товара».
export const productMoves = (orgId: string, productId: string) => getArray(`/api/stock/product-moves?orgId=${orgId}&productId=${productId}`)
export const stockIncome = (b: { name: string; qty: number; unit: string }) => post('/api/stock/income', b)

export const settings = (orgId: string) => getObj(`/api/settings?orgId=${orgId}`, { suppliers: [], projects: [], specProjects: [] })

export const categoryRules = (orgId: string) => getArray(`/api/settings/category-rules?orgId=${orgId}`)
export const saveCategoryRule = (b: any) => send('/api/settings/category-rules', 'PUT', b)
export const setDefaultLogist = (orgId: string, defaultLogistId: string) => send('/api/settings', 'PATCH', { orgId, defaultLogistId })
export const setDefaultContragent = (orgId: string, defaultContragentId: string) => send('/api/settings', 'PATCH', { orgId, defaultContragentId })
export const setOrgColor = (orgId: string, color: string) => send('/api/settings', 'PATCH', { orgId, color })

export const createProject = (b: any) => post('/api/projects', b)
export const createSpecProject = (b: any) => post('/api/spec-projects', b)
// Проекты с остатками (кол-во/вынесено/остаток) + деталь + вынос в карточку.
export const listSpecProjects = (orgId: string) => getArray(`/api/spec-projects?orgId=${orgId}`)
export const specProjectDetail = (id: string) => getObj(`/api/spec-projects/${id}`, null as any)
export const carveCard = (projectId: string, b: any) => post(`/api/spec-projects/${projectId}/carve`, b)
// Кабинет мастера: вынести часть спец-проекта сразу к логисту (минуя производство).
export const carveToLogist = (projectId: string, lines: { specItemId: string; qty: number }[]) => post(`/api/spec-projects/${projectId}/carve`, { mode: 'logist', lines })

// Спецификации (типы изделий) + склад материала (листы/обрезь).
export const listSpecTypes = (orgId: string, all = false) => getArray(`/api/spec-types?orgId=${orgId}${all ? '&all=1' : ''}`)
export const createSpecType = (b: any) => post('/api/spec-types', b)
export const editSpecType = (id: string, b: any) => patch(`/api/spec-types/${id}`, b)
export const materialStock = (orgId: string) => getArray(`/api/material?orgId=${orgId}`)
export const reviseSheet = (b: any) => post('/api/material', b)   // ревизия склада материала (факт кол-ва)
export const produceToStock = (items: any[]) => post('/api/material/produce', { items })   // «В запас» (листогиб → свой склад)
// Кабинет-передатчик листов: остатки по цветам + списание «взял N».
export const sheetsByColor = (orgId: string) => getArray(`/api/material/sheets?orgId=${orgId}`)
export const sheetsAll = () => getArray('/api/material/sheets?all=1')   // все орг (для дашборда)
export const materialReport = (orgId: string, from: string, to: string) => getObj(`/api/material/report?orgId=${orgId}&from=${from}&to=${to}`, null as any)
export const takeSheet = (color: string, qty: number) => post('/api/material/take', { color, qty })

// Справочник статей ДДС (дерево деятельность→группа→статья).
export const listDdsArticles = (orgId: string) => getArray(`/api/dds-articles?orgId=${orgId}`)
export const saveDdsArticle = (b: any) => post('/api/dds-articles', b)
export const archiveDdsArticle = (id: string) => send(`/api/dds-articles?id=${id}`, 'DELETE')

// Справочник сотрудников (для ЗП).
export const listEmployees = (orgId: string, all = false) => getArray(`/api/employees?orgId=${orgId}${all ? '&all=1' : ''}`)
export const saveEmployee = (b: any) => post('/api/employees', b)
export const archiveEmployee = (id: string) => send(`/api/employees?id=${id}`, 'DELETE')

export const autoPrices = (productIds: string[], contragentId?: string) =>
  getObj(`/api/pricing?productIds=${productIds.join(',')}${contragentId ? `&contragentId=${contragentId}` : ''}`, {})
