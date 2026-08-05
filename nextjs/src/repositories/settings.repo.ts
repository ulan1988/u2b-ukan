// Данные для панели Фильтр/Настройки (только запросы Drizzle).
import { db } from '../lib/db'
import { contragents, projects } from '../db/schema'
import { and, eq, or } from 'drizzle-orm'

// Поставщики = контрагенты kind supplier|both (не архивные) организации.
export const suppliers = (orgId: string) =>
  db.select().from(contragents).where(and(
    eq(contragents.orgId, orgId), eq(contragents.archived, false),
    or(eq(contragents.kind, 'supplier'), eq(contragents.kind, 'both')),
  ))

export const projectsByOrg = (orgId: string) =>
  db.select().from(projects).where(eq(projects.orgId, orgId))
