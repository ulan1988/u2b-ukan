// Домен: смены логиста (суточный отчёт).
import { getObj, post, getArray, send } from './http'
export const getDraft = (date?: string) => getObj(`/api/reports/draft${date ? `?date=${date}` : ''}`, { report: null, rows: [] })
export const pastDrafts = () => getArray('/api/reports/draft?scope=past')
export const addRow = (row: any, date?: string) => post('/api/reports/draft', { row, date })
export const updateRow = (id: string, row: any) => post('/api/reports/draft', { op: 'update', id, row })
export const deleteRow = (id: string) => post('/api/reports/draft', { op: 'delete', id })
export const closeShift = (date?: string) => post('/api/reports/daily', { date })

// Сводка дашборда (скоуп по организации/филиалу).
const EMPTY_DASH = { kpi: { active: 0, deliveredToday: 0, overdue: 0, inwork: 0, turnoverToday: 0 }, flow: { incoming: 0, reception: 0, outgoing: 0, accounting: 0, bookkeeping: 0, archive: 0 }, progress: { overallPct: 0, inwork: 0, delivered: 0, overdue: 0 }, attention: [], activity: [], topClients: [], specProjects: [] }
export const fetchDashboard = (orgId?: string) => getObj(`/api/dashboard${orgId ? `?orgId=${orgId}` : ''}`, EMPTY_DASH)

// Бухгалтерия: суточные отчёты логистов (все, кроме черновиков) + смены.
export const fetchDailyReports = (orgId?: string) => getArray(`/api/reports/daily${orgId ? `?orgId=${orgId}` : ''}`)
export const updateDailyReport = (id: string, status: string) => send(`/api/reports/daily/${id}`, 'PUT', { status })
export const postAllToBook = (orgId?: string) => post(`/api/orders/all${orgId ? `?orgId=${orgId}` : ''}`, {})
