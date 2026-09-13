// Справочники для форм (только запросы Drizzle).
import { db } from '../lib/db'
import { organizations, contragents, warehouses, products, cashAccounts, specTypes, productPrices } from '../db/schema'
import { and, eq, or, isNotNull, getTableColumns } from 'drizzle-orm'

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
// Товары для форм/пикеров. С orgId — цены ПРОДАЖИ (розница/опт/спец) берутся из product_prices
// этой орг (нет строки → 0, цена другой орг не подставляется). Закуп (priceIn) — общий шаблон.
export const listProducts = async (orgId?: string) => {
  const rows = await db.select({ ...getTableColumns(products), stdWidthCm: specTypes.widthCm, typeName: specTypes.name })
    .from(products).leftJoin(specTypes, eq(products.specTypeId, specTypes.id))
    .where(eq(products.archived, false))
  if (!orgId) return rows
  const pp = await db.select().from(productPrices).where(eq(productPrices.orgId, orgId))
  const m = new Map(pp.map(x => [x.productId, x]))
  return rows.map(r => { const o = m.get(r.id); return { ...r, priceRetail: o ? o.priceRetail : '0', priceOpt: o ? o.priceOpt : '0', priceSpec: o ? o.priceSpec : '0' } })
}

// Контрагенты по видящей орг: свои (viewerOrgId) + головного (шарятся вниз) + мосты (orgRefId,
// Контрагенты — СТРОГО СВОИ у каждой орг (viewerOrgId): свои клиенты/поставщики + свои
// меж-орг мосты (у моста orgId = его орг, поэтому попадает в «свои»). НЕ шарим контрагентов
// головного вниз и не показываем чужие мосты — у каждого кабинета свой список. Без viewerOrgId — все.
export const listContragents = async (viewerOrgId?: string | null) => {
  if (!viewerOrgId) return db.select().from(contragents).where(eq(contragents.archived, false))
  return db.select().from(contragents).where(and(
    eq(contragents.archived, false),
    eq(contragents.orgId, viewerOrgId),
  ))
}

export const listCashAccounts = () =>
  db.select().from(cashAccounts).where(eq(cashAccounts.archived, false))

// Организация по id — нужен её kind (hq | producer_seller | seller), от него зависит вид кабинета.
export const orgById = async (id: string) => {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
  return o || null
}
