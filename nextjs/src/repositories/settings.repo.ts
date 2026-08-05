// Данные для панели Фильтр/Настройки (только запросы Drizzle).
import { db } from '../lib/db'
import { contragents, projects, specProjects, specProjectItems } from '../db/schema'
import { and, eq, or, inArray } from 'drizzle-orm'

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
