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

// ОСТАТОК НА ДАТУ (ревизия): на начало дня, приход и расход за день, остаток на конец.
// Считаем по движениям склада (kind=move), резервы не трогаем.
export async function stockOnDate(orgId: string, date: string) {
  const wh = await central(orgId)
  if (!wh) return { items: [], warehouse: null }
  const { sqlClient } = await import('../lib/db')
  const rows = await sqlClient`
    select p.id::text id, p.name, p.unit,
      coalesce(sum(m.qty) filter (where m.date < ${date}), 0)::float start,
      coalesce(sum(m.qty) filter (where m.date = ${date} and m.qty > 0), 0)::float "in",
      coalesce(-sum(m.qty) filter (where m.date = ${date} and m.qty < 0), 0)::float "out",
      coalesce(sum(m.qty) filter (where m.date <= ${date}), 0)::float "end"
    from stock_movements m join products p on p.id = m.product_id
    where m.org_id = ${orgId} and m.warehouse_id = ${wh.id} and m.kind = 'move' and m.date <= ${date}
    group by p.id, p.name, p.unit
    having coalesce(sum(m.qty) filter (where m.date <= ${date}), 0) <> 0
        or coalesce(sum(m.qty) filter (where m.date = ${date}), 0) <> 0
    order by p.name` as unknown as Array<any>
  return { items: rows, warehouse: wh.name }
}

// РЕВИЗИЯ НА ДАТУ: пришёл список «сколько по факту», считаем учётный остаток на этот день
// и проводим РАЗНИЦУ одним документом (контрагент — технический «Начальный остаток»,
// комментарий «Ревизия ДД.ММ.ГГГГ»). Плюс — приход, минус — списание: в строке отрицательное
// кол-во, движение склада уходит в минус. Отдельных сущностей не заводим.
export async function applyRevision(orgId: string, date: string, rows: Array<{ productId: string; qty: number }>, actor?: any) {
  const wh = await central(orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад' }
  const { sqlClient } = await import('../lib/db')
  const ids = rows.map(r => String(r.productId)).filter(Boolean)
  if (!ids.length) return { ok: false as const, error: 'Нет позиций' }
  const cur = await sqlClient`select product_id::text id, coalesce(sum(qty),0)::float q from stock_movements
    where org_id=${orgId} and warehouse_id=${wh.id} and kind='move' and date <= ${date} and product_id = any(${ids}::uuid[])
    group by product_id` as unknown as Array<any>
  const byId: Record<string, number> = {}; for (const c of cur) byId[c.id] = Number(c.q)
  const prods = await sqlClient`select id::text id, name, unit, coalesce(price_in,0)::float price from products where id = any(${ids}::uuid[])` as unknown as Array<any>
  const pById: Record<string, any> = {}; for (const p of prods) pById[p.id] = p
  const lines: any[] = []
  for (const r of rows) {
    const id = String(r.productId); const p = pById[id]; if (!p) continue
    const diff = Math.round(((Number(r.qty) || 0) - (byId[id] || 0)) * 1000) / 1000
    if (Math.abs(diff) < 0.0001) continue
    lines.push({ productId: id, qty: diff, price: Number(p.price) || 0, unit: p.unit || 'шт', name: p.name })
  }
  if (!lines.length) return { ok: false as const, error: 'Расхождений нет — всё сходится' }
  const [cg] = await sqlClient`select id::text id from contragents where org_id=${orgId} and archived=false
    and name ilike '%начальн%' limit 1` as unknown as Array<any>
  if (!cg) return { ok: false as const, error: 'Нет технического контрагента «Начальный остаток» — заведите его' }
  const docSvc = await import('./document.service')
  const doc: any = await docSvc.createPurchase({
    orgId, contragentId: cg.id, warehouseId: wh.id, date, lines,
    comment: `Ревизия ${date.split('-').reverse().join('.')}`,
  } as any)
  const plus = lines.filter(l => l.qty > 0).length, minus = lines.length - plus
  return { ok: true as const, number: doc.number, changed: lines.length, plus, minus }
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

// Остаток Центр-Склада НА ДАТУ с деревом номенклатуры — для экрана логиста и его ревизии
// (правило владельца 20.11.2026: логист смотрит только Центр-Склад головного).
export async function stockOnDateGrouped(orgId: string, date: string) {
  const wh = await central(orgId)
  if (!wh) return { items: [], warehouse: null, date }
  const { sqlClient } = await import('../lib/db')
  const rows = await sqlClient`
    select p.id::text id, p.name, coalesce(p.unit,'шт') unit,
      coalesce(p."group" ,'') grp, coalesce(p.cat,'') cat, coalesce(p.subgroup,'') sub,
      coalesce(sum(m.qty), 0)::float qty
    from stock_movements m join products p on p.id = m.product_id
    where m.org_id = ${orgId} and m.warehouse_id = ${wh.id} and m.kind = 'move' and m.date <= ${date}
    group by 1,2,3,4,5,6 having coalesce(sum(m.qty), 0) <> 0
    order by 4,5,6,2` as unknown as Array<any>
  return { items: rows, warehouse: wh.name, date }
}
