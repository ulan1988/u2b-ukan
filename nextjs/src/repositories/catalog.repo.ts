// Создание записей справочников (только Drizzle).
import { db } from '../lib/db'
import { products, contragents, warehouses, cashAccounts } from '../db/schema'

export const createProduct = (v: typeof products.$inferInsert) => db.insert(products).values(v).returning()
export const createContragent = (v: typeof contragents.$inferInsert) => db.insert(contragents).values(v).returning()
export const createWarehouse = (v: typeof warehouses.$inferInsert) => db.insert(warehouses).values(v).returning()
export const createCashAccount = (v: typeof cashAccounts.$inferInsert) => db.insert(cashAccounts).values(v).returning()
