import type { z } from 'zod'
import * as repo from '../repositories/catalog.repo'
import type { createProductSchema, createContragentSchema, createWarehouseSchema, createCashAccountSchema } from '../dto/catalog.dto'

export async function addProduct(i: z.infer<typeof createProductSchema>) {
  const [p] = await repo.createProduct({
    name: i.name, unit: i.unit, category: i.category, group: i.group || '', subgroup: i.subgroup || '',
    priceIn: String(i.priceIn), priceRetail: String(i.priceRetail), priceOpt: String(i.priceOpt),
  })
  return p
}

export async function addContragent(i: z.infer<typeof createContragentSchema>) {
  const [c] = await repo.createContragent({ orgId: i.orgId, name: i.name, kind: i.kind, priceType: i.priceType, phone: i.phone || '' })
  return c
}

export async function addWarehouse(i: z.infer<typeof createWarehouseSchema>) {
  const [w] = await repo.createWarehouse({ orgId: i.orgId, name: i.name, isCentral: i.isCentral })
  return w
}

export async function addCashAccount(i: z.infer<typeof createCashAccountSchema>) {
  const [a] = await repo.createCashAccount({ orgId: i.orgId, name: i.name, kind: i.kind })
  return a
}
