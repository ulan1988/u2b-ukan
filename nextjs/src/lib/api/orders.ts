// Домен: заявки/карточки (админка, доска, порталы).
import { getArray, getOne, post, patch as patch2, send } from './http'

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
// Мастер → логисту: отправить целиком (posIds не задан) или частями (выбранные позиции).
export async function sendOrder(cardId: string, posIds?: string[]) {
  const r = await post(`/api/orders/${cardId}/send`, posIds && posIds.length ? { posIds } : {})
  return { ok: r.ok, error: r.error as string | undefined, remaining: r.data?.remaining as number | undefined }
}
// Сплит карточки: выбранные позиции → новая карточка.
export async function splitCard(cardId: string, posIds: string[]) {
  const r = await post(`/api/orders/${cardId}/split`, { posIds })
  return { ok: r.ok, error: r.error as string | undefined, id: r.data?.id as string | undefined }
}
// Касса мастера: оплатить (продать) — нал/каспи/сдача, долг авто.
export async function payCard(cardId: string, body: { cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string }) {
  const r = await post(`/api/orders/${cardId}/pay`, body)
  return { ok: r.ok, error: r.error as string | undefined, debt: r.data?.debt as number | undefined, number: r.data?.number as string | undefined }
}
export async function unpostSale(cardId: string) {
  const r = await send(`/api/orders/${cardId}/pay`, 'DELETE')
  return { ok: r.ok, error: r.error as string | undefined }
}
// Производство: внести изделия карточки в базу (создать товар + выпуск на склад).
export async function produceToBase(cardId: string) {
  const r = await post(`/api/orders/${cardId}/tobase`, {})
  return { ok: r.ok, error: r.error as string | undefined, number: r.data?.number as string | undefined, produced: r.data?.produced as number | undefined }
}
export async function setPosStatus(cardId: string, status: string, posId?: string) {
  const r = await post(`/api/orders/${cardId}/pos`, { posId, status })
  return { ok: r.ok }
}
export async function postInvoice(cardId: string) {
  const r = await post(`/api/orders/${cardId}/invoice`)
  return { ok: r.ok, error: r.error as string | undefined, number: r.data?.number as string | undefined }
}

export const listHistory = (orgId: string, f: { user?: string; from?: string; to?: string } = {}) => {
  const p = new URLSearchParams({ orgId }); if (f.user) p.set('user', f.user); if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to)
  return getArray(`/api/history?${p}`)
}

export const listMessages = (cardId: string) => getArray(`/api/orders/${cardId}/messages`)
export const sendMessage = (cardId: string, text: string) => post(`/api/orders/${cardId}/messages`, { text })
export const chatThreads = (orgId?: string) => getArray(`/api/chat/threads${orgId ? `?orgId=${orgId}` : ''}`)

// Позиции карточки (правка/добавление) — логист/филиал.
export async function updatePosition(cardId: string, posId: string, patch: any) {
  const r = await patch2(`/api/orders/${cardId}/position`, { posId, ...patch }); return { ok: r.ok }
}
export const addPosition = (cardId: string, body: any) => post(`/api/orders/${cardId}/position`, body)
export async function deletePosition(cardId: string, posId: string) {
  const r = await send(`/api/orders/${cardId}/position?posId=${posId}`, 'DELETE'); return { ok: r.ok }
}
export async function updateCard(cardId: string, patch: any) {
  const r = await patch2(`/api/orders/${cardId}`, patch); return { ok: r.ok }
}

// Порталы
export const logistOrders = (uid?: string) => getArray(`/api/logist/orders${uid ? `?uid=${uid}` : ''}`)
export const clientOrders = (uid?: string) => getArray(`/api/client/orders${uid ? `?uid=${uid}` : ''}`)
export const branchOrders = (uid?: string) => getArray(`/api/branch/orders${uid ? `?uid=${uid}` : ''}`)
// Смена мастера: сводка дня + добавление расхода (ЗП/текущий) + закрытие.
export const shiftSummary = (date: string, uid?: string) => getOne<any>(`/api/branch/shift?date=${date}${uid ? `&uid=${uid}` : ''}`)
export const addShiftExpense = (body: { kind: 'salary' | 'current'; who?: string; article?: string; accountId: string; amount: number; date: string }) => post('/api/branch/shift', body)
export const closeShiftDay = (date: string, uid?: string) => post('/api/branch/shift', { action: 'close', date, uid })
// Рентабельность по товару за период.
export const productProfit = (from: string, to: string, uid?: string) => getOne<any>(`/api/branch/profit?from=${from}&to=${to}${uid ? `&uid=${uid}` : ''}`)
export const createClientOrder = (body: any, uid?: string) => post(`/api/client/orders${uid ? `?uid=${uid}` : ''}`, body)
// Документы кабинета контрагента: { purchases, sales, returns } + приём.
export const clientDocs = (uid?: string) => getOne<{ purchases: any[]; sales: any[]; returns: any[] }>(`/api/client/docs${uid ? `?uid=${uid}` : ''}`)
export const acceptClientDoc = (id: string, uid?: string) => post(`/api/client/docs/${id}/accept${uid ? `?uid=${uid}` : ''}`)
export const track = (id: string) => getOne(`/api/track?id=${encodeURIComponent(id)}`)

// Касса продавца (филиал-магазин): пробить чек одним запросом — позиции + оплата.
export async function sellCheck(body: {
  uid?: string; contactId?: string; comment?: string
  cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string
  positions: { productId?: string; name1c: string; oral?: string; qty: number; unit?: string; price: number; widthCm?: number }[]
}) {
  const r = await post('/api/branch/sell', body)
  return {
    ok: r.ok, error: r.error as string | undefined,
    id: r.data?.id as string | undefined, number: r.data?.number as string | undefined,
    total: r.data?.total as number | undefined, debt: r.data?.debt as number | undefined,
  }
}
