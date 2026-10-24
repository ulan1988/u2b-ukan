// Клиент «Расчёт».
import { getObj, post } from './http'

export const calcGet = () => getObj<any>('/api/calc', null as any)
export const calcSave = (id: string | null, name: string, data: any) => post('/api/calc', { id, name, data })
