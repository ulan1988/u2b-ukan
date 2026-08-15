// Справочники для форм (только запросы Drizzle).
import { db } from '../lib/db'
import { organizations, contragents, warehouses, products, cashAccounts, specTypes } from '../db/schema'
import { and, eq, or, getTableColumns } from 'drizzle-orm'

export const listOrganizations = () =>
  db.select().from(organizations).where(eq(organizations.archived, false))

export const listSuppliers = () =>
  db.select().from(contragents).where(and(
    eq(contragents.archived, false),
    or(eq(contragents.kind, 'supplier'), eq(contragents.kind, 'both')),
  ))

export const listClients = () =>
  db.select().from(contragents).where(and(
    eq(contragents.archived, false),
    or(eq(contragents.kind, 'client'), eq(contragents.kind, 'both')),
  ))

export const listWarehouses = () =>
  db.select().from(warehouses).where(eq(warehouses.archived, false))

// Центральный склад организации (Центр-Склад) — куда приходует закуп, откуда списывает продажа.
export const centralWarehouse = async (orgId: string) => {
  const rows = await db.select().from(warehouses).where(and(eq(warehouses.orgId, orgId), eq(warehouses.archived, false)))
  return rows.find(w => w.isCentral) || rows[0] || null
}

// Товары для форм/пикеров + стандартный см и имя типа (спецификация) через join.
export const listProducts = () =>
  db.select({ ...getTableColumns(products), stdWidthCm: specTypes.widthCm, typeName: specTypes.name })
    .from(products).leftJoin(specTypes, eq(products.specTypeId, specTypes.id))
    .where(eq(products.archived, false))

export const listContragents = () =>
  db.select().from(contragents).where(eq(contragents.archived, false))

export const listCashAccounts = () =>
  db.select().from(cashAccounts).where(eq(cashAccounts.archived, false))
