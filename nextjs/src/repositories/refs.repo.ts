// Справочники для форм (только запросы Drizzle).
import { db } from '../lib/db'
import { organizations, contragents, warehouses, products, cashAccounts } from '../db/schema'
import { and, eq, or } from 'drizzle-orm'

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

export const listProducts = () =>
  db.select().from(products).where(eq(products.archived, false))

export const listContragents = () =>
  db.select().from(contragents).where(eq(contragents.archived, false))

export const listCashAccounts = () =>
  db.select().from(cashAccounts).where(eq(cashAccounts.archived, false))
