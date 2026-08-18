// Спецификации (типы изделий) + склад материала (листы/обрезь).
import { SHEET_WIDTH_CM, SHEET_LENGTH_CM, MIN_REMNANT_CM, optimizeCut } from '../lib/production'
import * as repo from '../repositories/material.repo'

// ── Типы изделий ──
export const listSpecTypes = (orgId: string) => repo.listSpecTypes(orgId)
export async function createSpecType(orgId: string, i: { name: string; widthCm: number; lengthCm?: number; workRate?: number }) {
  const [t] = await repo.insertSpecType({
    orgId, name: i.name, widthCm: String(i.widthCm || 0),
    lengthCm: String(i.lengthCm || SHEET_LENGTH_CM), workRate: String(i.workRate || 0),
  })
  return t
}
export async function editSpecType(id: string, i: { name?: string; widthCm?: number; lengthCm?: number; workRate?: number; archived?: boolean }) {
  const patch: Record<string, unknown> = {}
  if (i.name !== undefined) patch.name = i.name
  if (i.widthCm !== undefined) patch.widthCm = String(i.widthCm)
  if (i.lengthCm !== undefined) patch.lengthCm = String(i.lengthCm)
  if (i.workRate !== undefined) patch.workRate = String(i.workRate)
  if (i.archived !== undefined) patch.archived = i.archived
  const [t] = await repo.updateSpecType(id, patch)
  return t
}

// ── Склад материала ──
export const materialStock = (orgId: string) => repo.listMaterialPieces(orgId)

// Найти кусок-лист (для upsert по совпадению).
async function findSheet(orgId: string, i: { warehouseId?: string; productId?: string; color: string; widthCm: number; lengthCm: number }) {
  return (await repo.listMaterialPieces(orgId)).find((p: any) =>
    (p.productId || null) === (i.productId || null) && (p.color || '') === (i.color || '') &&
    Number(p.widthCm) === Number(i.widthCm) && Number(p.lengthCm) === Number(i.lengthCm) &&
    p.kind === 'sheet' && (p.warehouseId || null) === (i.warehouseId || null))
}

// Приход листов (целых) — из приходной накладной. Увеличивает кол-во. (Не UI-кнопка.)
export async function addSheets(orgId: string, i: { warehouseId?: string; productId?: string; color: string; widthCm?: number; lengthCm?: number; qty: number }) {
  const widthCm = i.widthCm || SHEET_WIDTH_CM, lengthCm = i.lengthCm || SHEET_LENGTH_CM
  const qty = Math.max(0, Math.round(Number(i.qty) || 0))
  if (qty <= 0) return { ok: false as const, error: 'Кол-во должно быть > 0' }
  const same = await findSheet(orgId, { ...i, widthCm, lengthCm })
  if (same) { const [u] = await repo.updateMaterialQty(same.id, Number(same.qty) + qty); return { ok: true as const, piece: u } }
  const [p] = await repo.insertMaterialPiece({ orgId, warehouseId: i.warehouseId || null, productId: i.productId || null, color: i.color || '', widthCm: String(widthCm), lengthCm: String(lengthCm), qty, kind: 'sheet' })
  return { ok: true as const, piece: p }
}

// ── Приход листов из накладной → склад материала (с нормализацией толщины) ──
// Правило владельца: 0,35 → наш единый 0,4; 0,45 — отдельный; глянец/мат — разные листы.
// Цена остаётся в документе (склад без цены). Листы считаем в ШТУКАХ.
const sheetColor = (n: string) => (n.match(/(\d{4})/) || [])[1] || (/(дуб|дерев|3d)/i.test(n) ? 'дерево' : '')
const sheetThick = (n: string) => (n.match(/(\d+[.,]\d+)/) || [])[1] || ''
const sheetIsMat = (n: string) => /(^|\s)мат(овый)?(\s|$)/i.test(n)
const isSheetProduct = (p: any) => p && p.category === 'material' && /лист/i.test(p.name)

export async function receiveSheetsFromLines(orgId: string, warehouseId: string | null | undefined, lines: { productId: string; qty: any }[]) {
  const refs = await import('../repositories/refs.repo')
  const prods: any[] = await refs.listProducts()
  const byId = new Map(prods.map(p => [p.id, p]))
  const findUnified = (color: string, thick: string, mat: boolean) =>
    prods.find(p => isSheetProduct(p) && sheetColor(p.name) === color && sheetThick(p.name) === thick && sheetIsMat(p.name) === mat)
  for (const l of lines) {
    const p = byId.get(l.productId)
    if (!isSheetProduct(p)) continue
    const color = sheetColor(p.name)
    const thick = sheetThick(p.name)
    const mat = sheetIsMat(p.name)
    const normThick = thick === '0,35' || thick === '0.35' ? '0,4' : thick   // 0,35 → наш 0,4
    // если нормализованный лист заведён — приходуем в него; иначе — в сам товар строки
    const target = (normThick !== thick ? findUnified(color, normThick, mat) : null) || p
    const qty = Math.round(Number(l.qty) || 0)
    if (qty > 0) await addSheets(orgId, { warehouseId: warehouseId || undefined, productId: target.id, color, widthCm: SHEET_WIDTH_CM, lengthCm: SHEET_LENGTH_CM, qty })
  }
}

// ── Раскрой ↔ склад (Ф2 кирпич2): списание целых листов + приход обрези ──
// Списать N целых листов цвета (только НЕ матовые), FIFO. Возвращает {taken, shortfall}.
async function deductSheets(orgId: string, color: string, count: number) {
  if (count <= 0) return { taken: 0, shortfall: 0 }
  const refs = await import('../repositories/refs.repo')
  const prods: any[] = await refs.listProducts()
  const matById = new Map(prods.map(p => [p.id, sheetIsMat(p.name)]))
  const pieces = (await repo.listMaterialPieces(orgId))
    .filter((p: any) => p.kind === 'sheet' && (p.color || '') === color && !matById.get(p.productId))
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())   // FIFO
  let need = count
  for (const pc of pieces) {
    if (need <= 0) break
    const take = Math.min(need, Number(pc.qty))
    await repo.updateMaterialQty(pc.id, Number(pc.qty) - take)
    need -= take
  }
  return { taken: count - need, shortfall: need }
}

// Приходовать обрезь (полоса ширины × 200). Если такой кусок есть — +кол-во.
async function addRemnant(orgId: string, color: string, widthCm: number, qty = 1) {
  const w = Math.round(widthCm)
  const same = (await repo.listMaterialPieces(orgId)).find((p: any) =>
    p.kind === 'remnant' && (p.color || '') === color && Number(p.widthCm) === w && Number(p.lengthCm) === SHEET_LENGTH_CM)
  if (same) { await repo.updateMaterialQty(same.id, Number(same.qty) + qty); return }
  await repo.insertMaterialPiece({ orgId, color, widthCm: String(w), lengthCm: String(SHEET_LENGTH_CM), qty, kind: 'remnant' })
}

// Раскрой карточки → движение склада: −целые листы по цвету, +обрезь ≥4см. Идемпотентность — у вызывающего.
export async function consumeForCut(orgId: string, positions: any[]) {
  const items = positions
    .filter(p => Number(p.leg) === 1 && Number(p.widthCm) > 0)
    .map(p => ({ name: p.name1c || p.oral || '', color: sheetColor(p.name1c || p.oral || ''), cm: Number(p.widthCm), qty: Number(p.qty) }))
    .filter(i => i.cm > 0 && i.qty > 0)
  if (!items.length) return null
  const pack = optimizeCut(items, SHEET_WIDTH_CM)
  const summary = { sheets: 0, remnants: 0, shortfall: 0, byColor: [] as any[] }
  for (const g of pack.byColor) {
    const d = await deductSheets(orgId, g.color, g.count)
    let rem = 0
    for (const sh of g.sheets) if (sh.waste >= MIN_REMNANT_CM) { await addRemnant(orgId, g.color, sh.waste); rem++ }
    summary.sheets += g.count; summary.remnants += rem; summary.shortfall += d.shortfall
    summary.byColor.push({ color: g.color, sheets: g.count, remnants: rem, shortfall: d.shortfall })
  }
  return summary
}

// Производство В ЗАПАС (листогиб → свой склад): списать листы раскроем + приходовать
// изделие в склад готовой продукции (по базе), пометка «собственное производство».
export async function produceToStock(orgId: string, items: { productId?: string; name: string; widthCm?: number; qty: number }[], _actor?: any) {
  const positions = items.map(i => ({ leg: 1, name1c: i.name, oral: i.name, widthCm: i.widthCm, qty: i.qty }))
  const consumed = await consumeForCut(orgId, positions)   // −листы, +обрезь (кирпич2)
  const refs = await import('../repositories/refs.repo')
  const wh = await refs.centralWarehouse(orgId)
  const outputs = items.filter(i => i.productId && Number(i.qty) > 0)
    .map(i => ({ productId: i.productId as string, qty: Number(i.qty), widthCm: i.widthCm ? Number(i.widthCm) : undefined, price: 0 }))
  let doc: any = null
  if (wh && outputs.length) {
    const docSvc = await import('./document.service')
    doc = await docSvc.createProduction({ orgId, warehouseId: wh.id, inputs: [], outputs, comment: 'Собственное производство (листогиб) — запас' } as any)
  }
  return { ok: true as const, consumed, produced: outputs.length, docId: doc?.id }
}

// Кабинет-передатчик листов: сколько целых листов по цветам (глянец/мат раздельно).
export async function sheetsByColor(orgId: string) {
  const refs = await import('../repositories/refs.repo')
  const prods: any[] = await refs.listProducts()
  const matById = new Map(prods.map(p => [p.id, sheetIsMat(p.name)]))
  const pieces = (await repo.listMaterialPieces(orgId)).filter((p: any) => p.kind === 'sheet')
  const map: Record<string, { color: string; glyan: number; mat: number }> = {}
  for (const p of pieces) {
    const key = p.color || '—'
    if (!map[key]) map[key] = { color: key, glyan: 0, mat: 0 }
    map[key][matById.get(p.productId) ? 'mat' : 'glyan'] += Number(p.qty)
  }
  return Object.values(map)
}

// Мастер взял N листов цвета (передатчик) — списываем целые листы (глянец, FIFO).
export async function takeSheets(orgId: string, color: string, qty: number) {
  const d = await deductSheets(orgId, color, Math.round(Number(qty) || 0))
  return { ok: true as const, ...d }
}

// РЕВИЗИЯ листов — выставить ФАКТИЧЕСКОЕ кол-во (add/reduce: списание, недостачи).
export async function reviseSheet(orgId: string, i: { warehouseId?: string; productId?: string; color: string; widthCm?: number; lengthCm?: number; qty: number }) {
  const widthCm = i.widthCm || SHEET_WIDTH_CM, lengthCm = i.lengthCm || SHEET_LENGTH_CM
  const qty = Math.max(0, Math.round(Number(i.qty) || 0))   // 0 допустим (обнуление при недостаче)
  const same = await findSheet(orgId, { ...i, widthCm, lengthCm })
  if (same) { const [u] = await repo.updateMaterialQty(same.id, qty); return { ok: true as const, piece: u } }
  const [p] = await repo.insertMaterialPiece({ orgId, warehouseId: i.warehouseId || null, productId: i.productId || null, color: i.color || '', widthCm: String(widthCm), lengthCm: String(lengthCm), qty, kind: 'sheet' })
  return { ok: true as const, piece: p }
}
