// Справочники: создание, правка, список с архивом (только Drizzle).
import { db } from '../lib/db'
import { products, contragents, warehouses, cashAccounts, units } from '../db/schema'
import { eq, asc } from 'drizzle-orm'

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
