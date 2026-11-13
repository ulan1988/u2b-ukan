// Табель смен (employee_shifts): отметки «кто на смене» по дням. Чтение — sqlClient, запись — drizzle.
// ЗП за день можно вписать руками (`amount`); пусто → дневной оклад сотрудника.
import { db, sqlClient } from '../lib/db'
import { employeeShifts } from '../db/schema'
import { and, eq } from 'drizzle-orm'

// Отмеченные сотрудники за день (id + ЗП этого дня, если вписана руками).
export const listMarks = (orgId: string, date: string) =>
  sqlClient`select employee_id::text "employeeId", amount::float amount from employee_shifts where org_id=${orgId} and date=${date}` as unknown as Promise<Array<{ employeeId: string; amount: number | null }>>

// Сумма ЗП отмеченных по дням за период (колонка ЗП месячного отчёта): ручная сумма, иначе оклад.
export const tabelSumByDay = (orgId: string, from: string, to: string) =>
  sqlClient`
    select s.date::text as "day", coalesce(sum(coalesce(s.amount, e.daily_wage)),0)::float zp, count(*)::int n
    from employee_shifts s join employees e on e.id = s.employee_id
    where s.org_id=${orgId} and s.date between ${from} and ${to}
    group by s.date` as unknown as Promise<Array<{ day: string; zp: number; n: number }>>

// Заменить набор отмеченных за день. Вписанные руками суммы СОХРАНЯЕМ (иначе снял/поставил
// птичку у соседа — и правка ЗП пропала).
export async function setMarks(orgId: string, date: string, ids: string[]) {
  const prev = await listMarks(orgId, date)
  const keep: Record<string, number | null> = {}
  for (const r of prev) keep[r.employeeId] = r.amount == null ? null : Number(r.amount)
  await db.delete(employeeShifts).where(and(eq(employeeShifts.orgId, orgId), eq(employeeShifts.date, date)))
  const vals = Array.from(new Set((ids || []).filter(Boolean)))
    .map(employeeId => ({ orgId, employeeId, date, amount: keep[employeeId] != null ? String(keep[employeeId]) : null }))
  if (vals.length) await db.insert(employeeShifts).values(vals as any)
  return vals.map(v => v.employeeId)
}

// Вписать ЗП сотрудника за этот день (null → вернуть дневной оклад).
export async function setMarkAmount(orgId: string, date: string, employeeId: string, amount: number | null) {
  const rows = await sqlClient`update employee_shifts set amount=${amount == null ? null : String(amount)}
    where org_id=${orgId} and date=${date} and employee_id=${employeeId} returning id::text` as unknown as Array<any>
  return rows.length > 0
}
