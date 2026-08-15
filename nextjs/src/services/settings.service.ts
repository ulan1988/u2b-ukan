import { randomUUID } from 'crypto'
import * as repo from '../repositories/settings.repo'

export async function createProject(orgId: string, name: string, clientId?: string) {
  const [p] = await repo.insertProject({ orgId, name, clientId: clientId ?? null })
  return p
}

interface SpecItemInput { name: string; qty: number; unit?: string; productId?: string; widthCm?: number; price?: number; supplierId?: string }
export async function createSpecProject(orgId: string, name: string, clientId: string | null, items: SpecItemInput[]) {
  const id = randomUUID()
  await repo.insertSpecProject({ id, orgId, name, clientId: clientId ?? null })
  await repo.insertSpecItems(items.filter(i => i.name).map(i => ({
    specProjectId: id, name: i.name, qty: String(i.qty || 0), unit: i.unit || 'шт',
    productId: i.productId ?? null,
    widthCm: i.widthCm != null ? String(i.widthCm) : null,
    price: String(i.price || 0),
    supplierId: i.supplierId ?? null,
  })))
  return { id, name }
}

// Список проектов с остатками (кол-во / вынесено / остаток) — для раздела «Проекты».
export async function specProjectsWithRemaining(orgId: string) {
  const specs = await repo.specProjectsByOrg(orgId)
  const items = await repo.specItemsByProjects(specs.map(s => s.id))
  const drawn = await repo.drawnBySpecItems(items.map((i: any) => i.id))
  const byProject: Record<string, any[]> = {}
  for (const it of items as any[]) {
    const d = drawn[it.id] || 0
    ;(byProject[it.specProjectId] ||= []).push({ ...it, drawn: d, remaining: Math.max(0, Number(it.qty) - d) })
  }
  return specs.map((s: any) => {
    const its = byProject[s.id] || []
    const totalQty = its.reduce((a, i) => a + Number(i.qty), 0)
    const totalDrawn = its.reduce((a, i) => a + i.drawn, 0)
    return { ...s, items: its, totalQty, totalDrawn, remaining: Math.max(0, totalQty - totalDrawn) }
  })
}

// Деталь проекта: позиции с остатком + дочерние карточки (с позициями) — экран «сборка».
export async function specProjectDetail(id: string) {
  const [sp] = await repo.specProjectById(id)
  if (!sp) return null
  const items = await repo.specItemsByProject(id)
  const drawn = await repo.drawnBySpecItems(items.map((i: any) => i.id))
  const withRem = (items as any[]).map(it => {
    const d = drawn[it.id] || 0
    return { ...it, drawn: d, remaining: Math.max(0, Number(it.qty) - d) }
  })
  const cards = await repo.ordersBySpecProject(id)
  const orderRepo = await import('../repositories/order.repo')
  const pos = await orderRepo.positionsByCards(cards.map((c: any) => c.id))
  const byCard: Record<string, any[]> = {}
  for (const p of pos as any[]) (byCard[p.cardId] ||= []).push(p)
  const cardsFull = (cards as any[]).map(c => ({ ...c, positions: byCard[c.id] || [] }))
  return { project: sp, items: withRem, cards: cardsFull }
}

// «Вынести в карточку»: часть кол-ва из позиций проекта → новая заявка в Приёмку.
// Валидируем остаток на сервере (нельзя вынести больше, чем осталось).
export async function carveCard(orgId: string, specProjectId: string,
  meta: { contactId?: string; fromName?: string; comment?: string; deadline?: string },
  lines: { specItemId: string; qty: number }[], actor?: any) {
  const items = await repo.specItemsByProject(specProjectId)
  const drawn = await repo.drawnBySpecItems(items.map((i: any) => i.id))
  const byId = new Map((items as any[]).map(i => [i.id, i]))
  const use = lines.filter(l => l.specItemId && Number(l.qty) > 0)
  if (!use.length) return { ok: false as const, error: 'Нечего выносить — укажите количество' }
  for (const l of use) {
    const it = byId.get(l.specItemId)
    if (!it) return { ok: false as const, error: 'Позиция проекта не найдена' }
    const rem = Number(it.qty) - (drawn[l.specItemId] || 0)
    if (Number(l.qty) > rem + 1e-9) return { ok: false as const, error: `«${it.name}»: остаток ${rem}, запрошено ${l.qty}` }
  }
  const positions = use.map(l => {
    const it = byId.get(l.specItemId)!
    return {
      productId: it.productId || undefined, name1c: it.name, oral: it.name,
      qty: Number(l.qty), unit: it.unit, price: Number(it.price) || 0,
      widthCm: it.widthCm != null ? Number(it.widthCm) : undefined,
      supplierId: it.supplierId || undefined, specItemId: l.specItemId,
    }
  })
  const { createOrder } = await import('./order.service')
  const res = await createOrder({
    orgId, kind: 'sale', screen: 'reception', block: 'processing',
    specProjectId, contactId: meta.contactId, fromName: meta.fromName || '',
    source: 'admin_manual', comment: meta.comment || '', deadline: meta.deadline,
    positions,
  } as any, actor)
  return { ok: true as const, ...res }
}

// Сводка для панели Фильтр (канбан-колонки): поставщики, проекты, спецпроекты (с items).
export async function settingsBundle(orgId: string) {
  const [suppliers, projects, specs, defaults] = await Promise.all([
    repo.suppliers(orgId), repo.projectsByOrg(orgId), repo.specProjectsByOrg(orgId), repo.orgDefaults(orgId),
  ])
  const items = await repo.specItemsByProjects(specs.map(s => s.id))
  const byProject: Record<string, any[]> = {}
  for (const it of items) (byProject[it.specProjectId] ||= []).push(it)
  const specProjects = specs.map(s => ({ ...s, items: byProject[s.id] || [] }))
  return { suppliers, projects, specProjects, defaultLogistId: defaults.defaultLogistId, defaultContragentId: defaults.defaultContragentId }
}

export const setDefaultLogist = (orgId: string, userId: string | null) => repo.setOrgDefaultLogist(orgId, userId || null)
export const setDefaultContragent = (orgId: string, contragentId: string | null) => repo.setOrgDefaultContragent(orgId, contragentId || null)
export const setOrgColor = (orgId: string, color: string) => repo.setOrgColor(orgId, color)
