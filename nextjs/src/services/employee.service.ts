// Справочник сотрудников филиала (для оплаты ЗП списком).
import { randomUUID } from 'crypto'
import { db } from '../lib/db'
import { employees } from '../db/schema'
import { eq, and, asc } from 'drizzle-orm'

export const listEmployees = (orgId: string, all = false) =>
  db.select().from(employees)
    .where(all ? eq(employees.orgId, orgId) : and(eq(employees.orgId, orgId), eq(employees.archived, false)))
    .orderBy(asc(employees.name))

export async function saveEmployee(orgId: string, b: any) {
  if (!b?.name?.trim()) return { ok: false as const, error: 'Укажите имя' }
  const fields = { name: b.name.trim(), position: b.position || '', dailyWage: String(Number(b.dailyWage) || 0) }
  if (b.id) {
    await db.update(employees).set({ ...fields, ...(b.archived !== undefined ? { archived: !!b.archived } : {}) }).where(eq(employees.id, b.id))
    return { ok: true as const, id: b.id }
  }
  const id = randomUUID()
  await db.insert(employees).values({ id, orgId, ...fields })
  return { ok: true as const, id }
}

export async function archiveEmployee(id: string) {
  await db.update(employees).set({ archived: true }).where(eq(employees.id, id))
  return { ok: true as const }
}
