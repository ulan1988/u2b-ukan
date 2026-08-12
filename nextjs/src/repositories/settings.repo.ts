// Данные для панели Фильтр/Настройки (только запросы Drizzle).
import { db } from '../lib/db'
import { contragents, projects, specProjects, specProjectItems, organizations } from '../db/schema'
import { and, eq, or, inArray } from 'drizzle-orm'

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

export const projectsByOrg = (orgId: string) =>
  db.select().from(projects).where(eq(projects.orgId, orgId))

export const specProjectsByOrg = (orgId: string) =>
  db.select().from(specProjects).where(eq(specProjects.orgId, orgId))

export const specItemsByProjects = (ids: string[]) =>
  ids.length ? db.select().from(specProjectItems).where(inArray(specProjectItems.specProjectId, ids)) : Promise.resolve([] as any[])

export const insertProject = (v: typeof projects.$inferInsert) => db.insert(projects).values(v).returning()
export const insertSpecProject = (v: typeof specProjects.$inferInsert) => db.insert(specProjects).values(v).returning()
export const insertSpecItems = (v: (typeof specProjectItems.$inferInsert)[]) => v.length ? db.insert(specProjectItems).values(v) : Promise.resolve()
