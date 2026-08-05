// Домен: смены логиста (суточный отчёт).
import { getObj, post } from './http'

export const getDraft = (date?: string) => getObj(`/api/reports/draft${date ? `?date=${date}` : ''}`, { report: null, rows: [] })
export const addRow = (row: any, date?: string) => post('/api/reports/draft', { row, date })
export const deleteRow = (id: string) => post('/api/reports/draft', { op: 'delete', id })
export const closeShift = (date?: string) => post('/api/reports/daily', { date })
