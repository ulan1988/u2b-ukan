// Табель (смена): посещаемость сотрудников по дням месяца. Данные одним JSON на орг+месяц.
import { db, sqlClient } from '../lib/db'
import { shiftAttendance } from '../db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const safe = (s: any) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : {} } catch { return {} } }

export async function getAttendance(orgId: string, month: string) {
  const [row] = await sqlClient`select data from shift_attendance where org_id=${orgId} and month=${month} limit 1` as unknown as Array<{ data: string }>
  return { month, data: row ? safe(row.data) : {} }
}

export async function saveAttendance(orgId: string, month: string, data: any) {
  const payload = JSON.stringify(data || {})
  const [ex] = await sqlClient`select id::text from shift_attendance where org_id=${orgId} and month=${month} limit 1` as unknown as Array<{ id: string }>
  if (ex) await db.update(shiftAttendance).set({ data: payload, updatedAt: new Date() }).where(eq(shiftAttendance.id, ex.id))
  else await db.insert(shiftAttendance).values({ id: randomUUID(), orgId, month, data: payload })
  return { ok: true as const }
}
