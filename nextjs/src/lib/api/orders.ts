// Домен: заявки/карточки (админка, доска, порталы).
import { getArray, getOne, post, patch as patch2 } from './http'

export const listOrders = (orgId: string) => getArray(`/api/orders?orgId=${orgId}`)
export const listByScreen = (orgId: string, screen: string) => getArray(`/api/orders?orgId=${orgId}&screen=${screen}`)
export const getCard = (id: string) => getOne(`/api/orders/${id}`)
export const createOrder = (body: any) => post('/api/orders', body)

export async function orderAction(id: string, action: string, payload: Record<string, any> = {}) {
  const r = await post(`/api/orders/${id}/action`, { action, payload })
  return { ok: r.ok, error: r.error as string | undefined }
}
export async function assignLogist(id: string, respUserId: string) {
  const r = await post(`/api/orders/${id}/assign`, { respUserId })
  return { ok: r.ok }
}
export async function setPosStatus(cardId: string, status: string, posId?: string) {
  const r = await post(`/api/orders/${cardId}/pos`, { posId, status })
  return { ok: r.ok }
}
export async function postInvoice(cardId: string) {
  const r = await post(`/api/orders/${cardId}/invoice`)
  return { ok: r.ok, error: r.error as string | undefined, number: r.data?.number as string | undefined }
}

export const listHistory = (orgId: string) => getArray(`/api/history?orgId=${orgId}`)

export const listMessages = (cardId: string) => getArray(`/api/orders/${cardId}/messages`)
export const sendMessage = (cardId: string, text: string) => post(`/api/orders/${cardId}/messages`, { text })

// Позиции карточки (правка/добавление) — логист/филиал.
export async function updatePosition(cardId: string, posId: string, patch: any) {
  const r = await patch2(`/api/orders/${cardId}/position`, { posId, ...patch }); return { ok: r.ok }
}
export const addPosition = (cardId: string, body: any) => post(`/api/orders/${cardId}/position`, body)

// Порталы
export const logistOrders = () => getArray('/api/logist/orders')
export const clientOrders = () => getArray('/api/client/orders')
export const branchOrders = () => getArray('/api/branch/orders')
export const createClientOrder = (body: any) => post('/api/client/orders', body)
export const track = (id: string) => getOne(`/api/track?id=${encodeURIComponent(id)}`)
