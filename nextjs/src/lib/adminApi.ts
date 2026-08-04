// Клиентские вызовы админки к слоистому бэкенду. Единая точка контракта фронта.
export const fetchOrders = (orgId: string): Promise<any[]> =>
  fetch(`/api/orders?orgId=${orgId}`).then(r => r.json()).then(r => (Array.isArray(r) ? r : [])).catch(() => [])

export const getCard = (id: string) =>
  fetch(`/api/orders/${id}`).then(r => r.json()).catch(() => null)

export async function orderAction(id: string, action: string, payload: Record<string, any> = {}) {
  const res = await fetch(`/api/orders/${id}/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, error: data.error as string | undefined }
}

export async function createOrder(body: any) {
  const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, data: await res.json().catch(() => ({})) }
}

export const fetchRefs = () => fetch('/api/refs').then(r => r.json()).catch(() => ({}))
export const fetchUsers = (): Promise<any[]> =>
  fetch('/api/users').then(r => r.json()).then(r => (Array.isArray(r) ? r : [])).catch(() => [])

export async function assignLogist(id: string, respUserId: string) {
  const res = await fetch(`/api/orders/${id}/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respUserId }),
  })
  return { ok: res.ok }
}

export async function setPosStatus(cardId: string, status: string, posId?: string) {
  const res = await fetch(`/api/orders/${cardId}/pos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posId, status }),
  })
  return { ok: res.ok }
}

export async function postInvoice(cardId: string) {
  const res = await fetch(`/api/orders/${cardId}/invoice`, { method: 'POST' })
  const d = await res.json().catch(() => ({}))
  return { ok: res.ok, error: d.error as string | undefined, number: d.number as string | undefined }
}

export const logout = () => fetch('/api/auth/logout', { method: 'POST' })
