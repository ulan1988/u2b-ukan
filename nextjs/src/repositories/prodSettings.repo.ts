// Производственные настройки организации: себестоимость 1 см листа (одна на все цвета).
import { db } from '../lib/db'
import { prodSettings } from '../db/schema'
import { eq } from 'drizzle-orm'

export async function get(orgId: string) {
  const [row] = await db.select().from(prodSettings).where(eq(prodSettings.orgId, orgId)).limit(1)
  return row || null
}

export async function save(orgId: string, v: { costPerCm: number; sheetPrice: number }) {
  const vals = { costPerCm: String(v.costPerCm), sheetPrice: String(v.sheetPrice), updatedAt: new Date() }
  const exist = await get(orgId)
  if (exist) await db.update(prodSettings).set(vals).where(eq(prodSettings.orgId, orgId))
  else await db.insert(prodSettings).values({ orgId, ...vals })
  return { ...vals, orgId }
}
