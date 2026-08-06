// Экран Склад: остатки (с резервом) + движения + ручной приход. По слоям.
import { randomUUID } from 'crypto'
import { db } from '../lib/db'
import { stockMovements, products, warehouses } from '../db/schema'
import { and, eq, desc, inArray } from 'drizzle-orm'
import { today } from '../lib/num'

async function central(orgId: string) {
  const rows = await db.select().from(warehouses).where(and(eq(warehouses.orgId, orgId), eq(warehouses.archived, false)))
  return rows.find(w => w.isCentral) || rows[0] || null
}

// Остатки центрального склада: qty (move-движения) и reserved (reserve-движения).
export async function stockOverview(orgId: string) {
  const wh = await central(orgId)
  if (!wh) return { items: [], warehouseId: null }
  const moves = await db.select().from(stockMovements).where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.warehouseId, wh.id)))
  const agg: Record<string, { qty: number; reserved: number }> = {}
  for (const m of moves) {
    const a = (agg[m.productId] ||= { qty: 0, reserved: 0 })
    if (m.kind === 'reserve') a.reserved += Math.abs(Number(m.qty))
    else a.qty += Number(m.qty)
  }
  const ids = Object.keys(agg)
  const prods = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : []
  const pById = new Map(prods.map(p => [p.id, p]))
  const items = ids.map(id => {
    const p: any = pById.get(id)
    return { id, name: p?.name || id, unit: p?.unit || 'шт', cat: p?.cat || '', qty: agg[id].qty, reserved: agg[id].reserved }
  }).filter(i => i.qty !== 0 || i.reserved !== 0).sort((a, b) => a.name.localeCompare(b.name))
  return { items, warehouseId: wh.id }
}

// Движения (последние). type: income | reserve | expense.
export async function movements(orgId: string, limit = 100) {
  const rows = await db.select().from(stockMovements).where(eq(stockMovements.orgId, orgId)).orderBy(desc(stockMovements.date), desc(stockMovements.id)).limit(limit)
  const ids = Array.from(new Set(rows.map(r => r.productId)))
  const prods = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : []
  const pById = new Map(prods.map(p => [p.id, p]))
  return rows.map(m => {
    const p: any = pById.get(m.productId)
    const q = Number(m.qty)
    const type = m.kind === 'reserve' ? 'reserve' : q >= 0 ? 'income' : 'expense'
    return { id: m.id, type, name: p?.name || m.productId, qty: Math.abs(q), unit: p?.unit || 'шт', cardId: m.cardId || null, documentId: m.documentId, createdAt: m.date }
  })
}

// Ручной приход на Центр-Склад. Товар по имени (создаём, если нет).
export async function manualIncome(orgId: string, name: string, qty: number, unit: string) {
  const wh = await central(orgId)
  if (!wh) return { ok: false as const, error: 'Нет склада' }
  const nm = (name || '').trim()
  if (!nm || !(qty > 0)) return { ok: false as const, error: 'Название и количество обязательны' }
  let [prod] = await db.select().from(products).where(eq(products.name, nm)).limit(1)
  if (!prod) [prod] = await db.insert(products).values({ name: nm, unit: unit || 'шт' }).returning()
  await db.insert(stockMovements).values({ id: randomUUID(), orgId, warehouseId: wh.id, productId: prod.id, qty: String(Math.abs(qty)), kind: 'move', date: today() })
  return { ok: true as const }
}
