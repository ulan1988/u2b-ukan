// База клиентского слоя данных. Все обёртки доменов строятся на этих функциях —
// компоненты не вызывают fetch напрямую.

export async function getArray<T = any>(url: string): Promise<T[]> {
  try { const r = await fetch(url); const j = await r.json(); return Array.isArray(j) ? j : [] } catch { return [] }
}

export async function getObj<T = any>(url: string, fallback: T = {} as T): Promise<T> {
  try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json() } catch { return fallback }
}

export async function getOne<T = any>(url: string): Promise<T | null> {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json() } catch { return null }
}

export interface Result { ok: boolean; data: any; error?: string }

export async function send(url: string, method: string, body?: any): Promise<Result> {
  try {
    const r = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, data, error: data?.error }
  } catch { return { ok: false, data: {}, error: 'Сеть недоступна' } }
}

export const post = (url: string, body?: any) => send(url, 'POST', body)
export const patch = (url: string, body: any) => send(url, 'PATCH', body)
