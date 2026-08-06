// Дашборд: справочные выборки (спецпроекты). Основные данные (заявки/позиции/история)
// берём через order.repo, чтобы не дублировать запросы. Только Drizzle.
import { db } from '../lib/db'
import { specProjects, specProjectItems } from '../db/schema'
import { and, eq, inArray } from 'drizzle-orm'

export const activeSpecProjects = (orgId: string) =>
  db.select().from(specProjects).where(and(eq(specProjects.orgId, orgId), eq(specProjects.status, 'active')))

export const specItems = (specIds: string[]) =>
  specIds.length
    ? db.select().from(specProjectItems).where(inArray(specProjectItems.specProjectId, specIds))
    : Promise.resolve([] as any[])
