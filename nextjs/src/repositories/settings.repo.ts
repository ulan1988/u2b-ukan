// Данные для панели Фильтр/Настройки (только запросы Drizzle).
import { db } from '../lib/db'
import { contragents, specProjects, specProjectItems, organizations, orders, orderPositions } from '../db/schema'
import { and, eq, or, inArray, sql, desc } from 'drizzle-orm'

// Настройки-умолчания организации: логист (авто-связанные продажи) и контрагент (первым в списке).
export const orgDefaults = async (orgId: string) => {
  const [o] = await db.select({ logist: organizations.defaultLogistId, contragent: organizations.defaultContragentId })
    .from(organizations).where(eq(organizations.id, orgId)).limit(1)
  return { defaultLogistId: o?.logist || null, defaultContragentId: o?.contragent || null }
}
export const orgDefaultLogist = async (orgId: string) => (await orgDefaults(orgId)).defaultLogistId
export const setOrgDefaultLogist = (orgId: string, userId: string | null) =>
  db.update(organizations).set({ defaultLogistId: userId }).where(eq(organizations.id, orgId))
export const setOrgDefaultContragent = (orgId: string, contragentId: string | null) =>
  db.update(organizations).set({ defaultContragentId: contragentId }).where(eq(organizations.id, orgId))
export const setOrgColor = (orgId: string, color: string) =>
  db.update(organizations).set({ color }).where(eq(organizations.id, orgId))

// Поставщики = контрагенты kind supplier|both (не архивные) организации.
export const suppliers = (orgId: string) =>
  db.select().from(contragents).where(and(
    eq(contragents.orgId, orgId), eq(contragents.archived, false),
    or(eq(contragents.kind, 'supplier'), eq(contragents.kind, 'both')),
  ))


export const specProjectsByOrg = (orgId: string) =>
  db.select().from(specProjects).where(eq(specProjects.orgId, orgId))

export const specItemsByProjects = (ids: string[]) =>
  ids.length ? db.select().from(specProjectItems).where(inArray(specProjectItems.specProjectId, ids)) : Promise.resolve([] as any[])

export const insertSpecProject = (v: typeof specProjects.$inferInsert) => db.insert(specProjects).values(v).returning()
export const insertSpecItems = (v: (typeof specProjectItems.$inferInsert)[]) => v.length ? db.insert(specProjectItems).values(v) : Promise.resolve()

export const specProjectById = (id: string) =>
  db.select().from(specProjects).where(eq(specProjects.id, id)).limit(1)
export const specItemsByProject = (id: string) =>
  db.select().from(specProjectItems).where(eq(specProjectItems.specProjectId, id)).orderBy(specProjectItems.name)

// Вынесено по каждой позиции проекта = Σ кол-ва позиций карточек (не отменённых) с этим spec_item_id.
export const drawnBySpecItems = async (ids: string[]): Promise<Record<string, number>> => {
  if (!ids.length) return {}
  const rows = await db.select({
      specItemId: orderPositions.specItemId,
      drawn: sql<number>`coalesce(sum(${orderPositions.qty}),0)::float`,
    })
    .from(orderPositions)
    .innerJoin(orders, eq(orderPositions.cardId, orders.id))
    .where(and(inArray(orderPositions.specItemId, ids), eq(orders.isCancelled, false)))
    .groupBy(orderPositions.specItemId)
  const map: Record<string, number> = {}
  for (const r of rows) if (r.specItemId) map[r.specItemId] = Number(r.drawn)
  return map
}

// Карточки проекта (не отменённые) — для экрана «сборка».
export const ordersBySpecProject = (id: string) =>
  db.select().from(orders).where(and(eq(orders.specProjectId, id), eq(orders.isCancelled, false))).orderBy(desc(orders.createdAt))
