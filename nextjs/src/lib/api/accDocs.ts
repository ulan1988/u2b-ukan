// Домен: Бухгалтерия → печатные документы (счёт / накладная / акт / КП) и реквизиты организации.
import { getArray, getObj, send } from './http'

export const accDocsList = (orgId: string) => getArray(`/api/acc-docs?orgId=${orgId}`)
export const accDocNext = async (orgId: string, type: string): Promise<number> => (await getObj(`/api/acc-docs?orgId=${orgId}&next=${type}`)).number || 1
export const accDocCreate = (orgId: string, body: any) => send(`/api/acc-docs?orgId=${orgId}`, 'POST', body)
export const accDocDelete = (id: string) => send(`/api/acc-docs/${id}`, 'DELETE')
export const accDocFileUrl = (id: string, fmt: 'excel' | 'word') => `/api/acc-docs/${id}/file?fmt=${fmt}`
export const accSettings = (orgId: string) => getObj(`/api/acc-docs/settings?orgId=${orgId}`)
export const accSettingsSave = (orgId: string, patch: any) => send(`/api/acc-docs/settings?orgId=${orgId}`, 'PATCH', patch)
