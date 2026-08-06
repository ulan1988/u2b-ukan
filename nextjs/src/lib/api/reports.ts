// Домен: смены логиста (суточный отчёт).
import { getObj, post } from './http'

import { getArray } from './http'
export const getDraft = (date?: string) => getObj(`/api/reports/draft${date ? `?date=${date}` : ''}`, { report: null, rows: [] })
export const pastDrafts = () => getArray('/api/reports/draft?scope=past')
export const addRow = (row: any, date?: string) => post('/api/reports/draft', { row, date })
export const updateRow = (id: string, row: any) => post('/api/reports/draft', { op: 'update', id, row })
export const deleteRow = (id: string) => post('/api/reports/draft', { op: 'delete', id })
export const closeShift = (date?: string) => post('/api/reports/daily', { date })
