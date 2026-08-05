// Домен: автозакуп (сводка потребности, стейджинг в черновик закупа).
import { getArray, post } from './http'

export const demandSummary = (orgId: string) => getArray(`/api/procurement/summary?orgId=${orgId}`)
export const stage = (items: any[]) => post('/api/procurement/stage', { items })
export const chainReport = (orgId: string) => getArray(`/api/procurement/report?orgId=${orgId}`)
