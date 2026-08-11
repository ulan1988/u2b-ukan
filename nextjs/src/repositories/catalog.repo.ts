// Справочники: создание, правка, список с архивом (только Drizzle).
import { db } from '../lib/db'
import { products, contragents, warehouses, cashAccounts, units, nomFolders } from '../db/schema'
import { eq, and, asc, sql } from 'drizzle-orm'

// Справочник единиц измерения (глобальный). products.unit хранит текст — правка единиц не ломает товары.
export const listUnits = () => db.select().from(units).where(eq(units.archived, false)).orderBy(asc(units.sortOrder))
export const clearUnits = () => db.delete(units)
export const insertUnits = (vals: typeof units.$inferInsert[]) => vals.length ? db.insert(units).values(vals) : Promise.resolve()

export const createProduct = (v: typeof products.$inferInsert) => db.insert(products).values(v).returning()
export const createContragent = (v: typeof contragents.$inferInsert) => db.insert(contragents).values(v).returning()
export const createWarehouse = (v: typeof warehouses.$inferInsert) => db.insert(warehouses).values(v).returning()
export const createCashAccount = (v: typeof cashAccounts.$inferInsert) => db.insert(cashAccounts).values(v).returning()

export const updateProduct = (id: string, patch: Partial<typeof products.$inferInsert>) =>
  db.update(products).set(patch).where(eq(products.id, id)).returning()
export const updateContragent = (id: string, patch: Partial<typeof contragents.$inferInsert>) =>
  db.update(contragents).set(patch).where(eq(contragents.id, id)).returning()

// Управление справочником — включая архивные (для UI правки).
export const listAllProducts = () => db.select().from(products)
export const listAllContragents = () => db.select().from(contragents)

// ── Папки номенклатуры ─────────────────────────────────────────────────
export const listFolders = () => db.select().from(nomFolders).orderBy(asc(nomFolders.sortOrder))

// Создать папку по пути (grp / grp+cat / grp+cat+sub). Дубли молча игнорируются.
export async function createFolder(grp: string, cat: string, sub: string) {
  grp = (grp || '').trim(); cat = (cat || '').trim(); sub = (sub || '').trim()
  if (!grp) return { ok: false, error: 'Пустое имя группы' }
  if (sub && !cat) return { ok: false, error: 'Нет категории для подгруппы' }
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${nomFolders.sortOrder}),0)` }).from(nomFolders)
  await db.insert(nomFolders).values({ grp, cat, sub, sortOrder: Number(m) + 1 }).onConflictDoNothing()
  return { ok: true }
}

// Переименовать папку — тянет за собой строки-потомки и все товары в ней (без сирот).
export async function renameFolder(grp: string, cat: string, sub: string, name: string) {
  name = (name || '').trim(); if (!name) return { ok: false, error: 'Пустое имя' }
  if (sub) {
    await db.update(nomFolders).set({ sub: name }).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat), eq(nomFolders.sub, sub)))
    await db.update(products).set({ subgroup: name }).where(and(eq(products.cat, cat), eq(products.subgroup, sub)))
  } else if (cat) {
    await db.update(nomFolders).set({ cat: name }).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat)))
    await db.update(products).set({ cat: name }).where(and(eq(products.group, grp), eq(products.cat, cat)))
  } else {
    await db.update(nomFolders).set({ grp: name }).where(eq(nomFolders.grp, grp))
    await db.update(products).set({ group: name }).where(eq(products.group, grp))
  }
  return { ok: true }
}

// Удалить папку — только если в ней нет товаров (иначе — сироты). Удаляет и строки-потомки.
export async function deleteFolder(grp: string, cat: string, sub: string) {
  const has = async (w: any) => { const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(products).where(w); return Number(c) > 0 }
  if (sub) {
    if (await has(and(eq(products.cat, cat), eq(products.subgroup, sub)))) return { ok: false, error: 'В папке есть товары — сначала перенесите' }
    await db.delete(nomFolders).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat), eq(nomFolders.sub, sub)))
  } else if (cat) {
    if (await has(and(eq(products.group, grp), eq(products.cat, cat)))) return { ok: false, error: 'В категории есть товары — сначала перенесите' }
    await db.delete(nomFolders).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat)))
  } else {
    if (await has(eq(products.group, grp))) return { ok: false, error: 'В группе есть товары — сначала перенесите' }
    await db.delete(nomFolders).where(eq(nomFolders.grp, grp))
  }
  return { ok: true }
}
