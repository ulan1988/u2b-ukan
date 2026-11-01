// Табель смен (employee_shifts): отметки «кто на смене» по дням. Чтение — sqlClient, запись — drizzle.
import { db, sqlClient } from '../lib/db'
import { employeeShifts } from '../db/schema'
import { and, eq } from 'drizzle-orm'

// Отмеченные сотрудники за день (id).
export const listMarks = (orgId: string, date: string) =>
  sqlClient`select employee_id::text "employeeId" from employee_shifts where org_id=${orgId} and date=${date}` as unknown as Promise<Array<{ employeeId: string }>>

// Сумма окладов отмеченных по дням за период (для колонки ЗП месячного отчёта).
export const tabelSumByDay = (orgId: string, from: string, to: string) =>
  sqlClient`
    select s.date::text as "day", coalesce(sum(e.daily_wage),0)::float zp, count(*)::int n
    from employee_shifts s join employees e on e.id = s.employee_id
    where s.org_id=${orgId} and s.date between ${from} and ${to}
    group by s.date` as unknown as Promise<Array<{ day: string; zp: number; n: number }>>

// Заменить набор отмеченных за день (удалить старые → вставить новые).
export async function setMarks(orgId: string, date: string, ids: string[]) {
  await db.delete(employeeShifts).where(and(eq(employeeShifts.orgId, orgId), eq(employeeShifts.date, date)))
  const vals = Array.from(new Set((ids || []).filter(Boolean))).map(employeeId => ({ orgId, employeeId, date }))
  if (vals.length) await db.insert(employeeShifts).values(vals as any)
  return vals.map(v => v.employeeId)
}
