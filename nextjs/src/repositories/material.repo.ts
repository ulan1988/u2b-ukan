// Спецификации (типы изделий) + склад материала (куски: листы/обрезь). Только Drizzle.
import { db } from '../lib/db'
import { specTypes, materialPieces } from '../db/schema'
import { eq, desc, asc } from 'drizzle-orm'

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
