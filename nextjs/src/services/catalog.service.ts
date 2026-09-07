import type { z } from 'zod'
import * as repo from '../repositories/catalog.repo'
import type {
  createProductSchema, createContragentSchema, createWarehouseSchema, createCashAccountSchema,
  updateProductSchema, updateContragentSchema,
} from '../dto/catalog.dto'

// Цены ПРОДАЖИ по орг — в product_prices (upsert). Товар/шаблон (имя/дерево/закуп) в products.
async function upsertOrgPrices(orgId: string, productId: string, fields: Record<string, string>) {
  const { db } = await import('../lib/db')
  const { productPrices } = await import('../db/schema')
  const { and, eq } = await import('drizzle-orm')
  const [ex] = await db.select().from(productPrices).where(and(eq(productPrices.orgId, orgId), eq(productPrices.productId, productId))).limit(1)
  if (ex) await db.update(productPrices).set(fields).where(eq(productPrices.id, ex.id))
  else await db.insert(productPrices).values({ orgId, productId, priceRetail: '0', priceOpt: '0', priceSpec: '0', ...fields })
}

export async function addProduct(i: z.infer<typeof createProductSchema>, orgId?: string) {
  // Шаблон: имя/дерево + закуп (общий). Цены продажи не пишем в шаблон.
  const [p] = await repo.createProduct({
    name: i.name, unit: i.unit, category: i.category, group: i.group || '', cat: i.cat || '', subgroup: i.subgroup || '',
    priceIn: String(i.priceIn), priceRetail: '0', priceOpt: '0', priceSpec: '0',
  })
  // Цены продажи (если заданы) — на орг создателя.
  const sell: Record<string, string> = {}
  if (Number(i.priceRetail) > 0) sell.priceRetail = String(i.priceRetail)
  if (Number(i.priceOpt) > 0) sell.priceOpt = String(i.priceOpt)
  if (Number((i as any).priceSpec ?? 0) > 0) sell.priceSpec = String((i as any).priceSpec)
  if (orgId && Object.keys(sell).length) await upsertOrgPrices(orgId, p.id, sell)
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

// Массовая установка цен «на всех показанных»: приход (общий шаблон) + розница/опт/спец
// (в product_prices выбранной орг). Пустые поля не трогаем. Одним апсертом.
export async function bulkSetPrices(ids: string[], fields: { priceIn?: number; priceRetail?: number; priceOpt?: number; priceSpec?: number }, orgId?: string) {
  if (!ids.length) return { ok: false as const, error: 'Нет товаров' }
  const { db } = await import('../lib/db')
  const { products, productPrices } = await import('../db/schema')
  const { inArray } = await import('drizzle-orm')
  // Приход (себестоимость) — общий шаблон.
  if (fields.priceIn !== undefined) await db.update(products).set({ priceIn: String(fields.priceIn) }).where(inArray(products.id, ids))
  // Цены продажи.
  const sell: Record<string, string> = {}
  if (fields.priceRetail !== undefined) sell.priceRetail = String(fields.priceRetail)
  if (fields.priceOpt !== undefined) sell.priceOpt = String(fields.priceOpt)
  if (fields.priceSpec !== undefined) sell.priceSpec = String(fields.priceSpec)
  if (Object.keys(sell).length) {
    if (orgId) {
      await db.insert(productPrices)
        .values(ids.map(id => ({ orgId, productId: id, priceRetail: '0', priceOpt: '0', priceSpec: '0', ...sell })))
        .onConflictDoUpdate({ target: [productPrices.orgId, productPrices.productId], set: sell })
    } else {
      await db.update(products).set(sell).where(inArray(products.id, ids))
    }
  }
  return { ok: true as const, count: ids.length }
}

export async function editProduct(id: string, i: z.infer<typeof updateProductSchema>, orgId?: string) {
  // Шаблон (общий): имя/ед./дерево/тип/архив + закуп-себестоимость (priceIn).
  const patch: Record<string, unknown> = {}
  if (i.name !== undefined) patch.name = i.name
  if (i.unit !== undefined) patch.unit = i.unit
  if (i.category !== undefined) patch.category = i.category
  if (i.group !== undefined) patch.group = i.group
  if (i.cat !== undefined) patch.cat = i.cat
  if (i.subgroup !== undefined) patch.subgroup = i.subgroup
  if (i.priceIn !== undefined) patch.priceIn = String(i.priceIn)          // закуп — общий шаблон
  if (i.specTypeId !== undefined) patch.specTypeId = i.specTypeId || null
  if (i.archived !== undefined) patch.archived = i.archived
  // Цены ПРОДАЖИ — в product_prices выбранной орг (без орг — в шаблон, как раньше).
  const sell: Record<string, string> = {}
  if (i.priceRetail !== undefined) sell.priceRetail = String(i.priceRetail)
  if (i.priceOpt !== undefined) sell.priceOpt = String(i.priceOpt)
  if ((i as any).priceSpec !== undefined) sell.priceSpec = String((i as any).priceSpec)
  if (Object.keys(sell).length) {
    if (orgId) await upsertOrgPrices(orgId, id, sell)
    else Object.assign(patch, sell)   // редактирование шаблона (без орг)
  }
  const [p] = Object.keys(patch).length ? await repo.updateProduct(id, patch) : await repo.getProduct(id)
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
