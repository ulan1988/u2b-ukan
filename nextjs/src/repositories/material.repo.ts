// Спецификации (типы изделий) + склад материала (куски: листы/обрезь). Только Drizzle.
import { db } from '../lib/db'
import { specTypes, materialPieces, materialLog } from '../db/schema'
import { eq, desc, asc } from 'drizzle-orm'

// Журнал листов (кто/цвет/кол-во).
export const insertMaterialLog = (v: typeof materialLog.$inferInsert) => db.insert(materialLog).values(v)
export const recentMaterialLog = (orgId: string, limit = 30) =>
  db.select().from(materialLog).where(eq(materialLog.orgId, orgId)).orderBy(desc(materialLog.createdAt)).limit(limit)

// ── Типы изделий (спецификация) ── глобальны (номенклатура общая), org не фильтруем.
export const listSpecTypes = (_orgId?: string) =>
  db.select().from(specTypes).where(eq(specTypes.archived, false)).orderBy(asc(specTypes.name))
export const insertSpecType = (v: typeof specTypes.$inferInsert) => db.insert(specTypes).values(v).returning()
export const updateSpecType = (id: string, patch: Partial<typeof specTypes.$inferInsert>) =>
  db.update(specTypes).set(patch).where(eq(specTypes.id, id)).returning()

// ── Склад материала (куски) ──
export const listMaterialPieces = (orgId: string) =>
  db.select().from(materialPieces).where(eq(materialPieces.orgId, orgId)).orderBy(asc(materialPieces.color), desc(materialPieces.widthCm))
export const listAllMaterialPieces = () =>
  db.select().from(materialPieces).orderBy(asc(materialPieces.color), desc(materialPieces.widthCm))
export const insertMaterialPiece = (v: typeof materialPieces.$inferInsert) => db.insert(materialPieces).values(v).returning()
export const updateMaterialQty = (id: string, qty: number) =>
  db.update(materialPieces).set({ qty }).where(eq(materialPieces.id, id)).returning()

// Данные месячной сверки: листы взято (кабинет), см продано (карточки), см в запас (производство).
export async function monthCloseData(orgId: string, from: string, to: string) {
  const { sqlClient } = await import('../lib/db')
  const [taken, sold, stock] = await Promise.all([
    sqlClient`select color, sum(-qty)::int as sheets from material_log
      where org_id=${orgId} and qty<0 and created_at>=${from} and created_at<${to} group by color order by sum(-qty) desc`,
    sqlClient`select coalesce(sum(op.width_cm*op.qty),0)::float as cm, coalesce(sum(op.qty),0)::float as pcs
      from order_positions op join orders o on o.id=op.card_id
      where o.org_id=${orgId} and o.kind='sale' and o.is_cancelled=false and op.width_cm is not null
        and o.delivered is not null and o.delivered>=${from} and o.delivered<${to}`,
    sqlClient`select coalesce(sum(dl.width_cm*dl.qty),0)::float as cm, coalesce(sum(dl.qty),0)::float as pcs
      from document_lines dl join documents d on d.id=dl.document_id
      where d.org_id=${orgId} and d.type='production' and d.comment ilike '%запас%' and dl.role='output' and dl.width_cm is not null
        and d.date>=${from} and d.date<${to}`,
  ])
  return { taken: taken as any[], sold: (sold as any[])[0], stock: (stock as any[])[0] }
}
