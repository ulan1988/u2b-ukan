// Клиент «Расчёт»: вкладки-листы (расчёт для клиента), сохранение по вкладке.
import { getObj, post } from './http'

export const calcGet = (id?: string | null) => getObj<any>(`/api/calc${id ? `?id=${id}` : ''}`, null as any)
export const calcSave = (id: string | null, name: string, data: any) => post('/api/calc', { id, name, data })
export const calcCreate = (name: string, fromId?: string | null) => post('/api/calc', { action: 'create', name, fromId })
export const calcDelete = (id: string) => post('/api/calc', { action: 'delete', id })
