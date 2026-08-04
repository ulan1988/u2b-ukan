// Домен: финансы и рентабельность.
import { getObj } from './http'

export const finance = (orgId: string) => getObj(`/api/finance?orgId=${orgId}`)
export const profit = (orgId: string) => getObj(`/api/profit?orgId=${orgId}`)
