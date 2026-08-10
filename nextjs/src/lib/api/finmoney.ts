// Клиент листа «Деньги».
import { getObj, post } from './http'

export const finDay = (date: string) => getObj<any>(`/api/finance/money?date=${date}`, null as any)
export const finSaveRow = (row: any) => post('/api/finance/money', { action: 'save', row })
export const finDeleteRow = (id: string) => post('/api/finance/money', { action: 'delete', id })
export const finReorder = (ids: string[]) => post('/api/finance/money', { action: 'reorder', ids })
export const finPost = (date: string) => post('/api/finance/money', { action: 'post', date })
export const finFavSave = (favs: any[]) => post('/api/finance/money', { action: 'favSave', favs })
export const finFavApply = (date: string) => post('/api/finance/money', { action: 'favApply', date })
export const finDocSearch = (q: string) => post('/api/finance/money', { action: 'docSearch', q })
