import type { z } from 'zod'
import * as repo from '../repositories/catalog.repo'
import type {
  createProductSchema, createContragentSchema, createWarehouseSchema, createCashAccountSchema,
  updateProductSchema, updateContragentSchema,
} from '../dto/catalog.dto'

export async function addProduct(i: z.infer<typeof createProductSchema>) {
  const [p] = await repo.createProduct({
    name: i.name, unit: i.unit, category: i.category, group: i.group || '', cat: i.cat || '', subgroup: i.subgroup || '',
    priceIn: String(i.priceIn), priceRetail: String(i.priceRetail), priceOpt: String(i.priceOpt),
  })
  return p
}

export async function addContragent(i: z.infer<typeof createContragentSchema>) {
  const [c] = await repo.createContragent({
    orgId: i.orgId, name: i.name, kind: i.kind, priceType: i.priceType, phone: i.phone || '',
    bin: (i as any).bin || null, openingBalance: String((i as any).openingBalance ?? 0),
  })
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

export async function editProduct(id: string, i: z.infer<typeof updateProductSchema>) {
  const patch: Record<string, unknown> = {}
  if (i.name !== undefined) patch.name = i.name
  if (i.unit !== undefined) patch.unit = i.unit
  if (i.category !== undefined) patch.category = i.category
  if (i.group !== undefined) patch.group = i.group
  if (i.cat !== undefined) patch.cat = i.cat
  if (i.subgroup !== undefined) patch.subgroup = i.subgroup
  if (i.priceIn !== undefined) patch.priceIn = String(i.priceIn)          // numeric → string
  if (i.priceRetail !== undefined) patch.priceRetail = String(i.priceRetail)
  if (i.priceOpt !== undefined) patch.priceOpt = String(i.priceOpt)
  if (i.specTypeId !== undefined) patch.specTypeId = i.specTypeId || null
  if (i.archived !== undefined) patch.archived = i.archived
  const [p] = await repo.updateProduct(id, patch)
  return p
}

export async function editContragent(id: string, i: z.infer<typeof updateContragentSchema>) {
  const patch: Record<string, unknown> = {}
  for (const k of ['name', 'kind', 'priceType', 'phone', 'comment', 'favorite', 'archived'] as const) {
    if (i[k] !== undefined) patch[k] = i[k]
  }
  if ((i as any).bin !== undefined) patch.bin = (i as any).bin || null
  if ((i as any).openingBalance !== undefined) patch.openingBalance = String((i as any).openingBalance || 0)
  const [c] = await repo.updateContragent(id, patch)
  return c
}
