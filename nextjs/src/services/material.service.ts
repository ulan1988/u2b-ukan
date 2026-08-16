// Спецификации (типы изделий) + склад материала (листы/обрезь).
import { SHEET_WIDTH_CM, SHEET_LENGTH_CM } from '../lib/production'
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

// РЕВИЗИЯ листов — выставить ФАКТИЧЕСКОЕ кол-во (add/reduce: списание, недостачи).
export async function reviseSheet(orgId: string, i: { warehouseId?: string; productId?: string; color: string; widthCm?: number; lengthCm?: number; qty: number }) {
  const widthCm = i.widthCm || SHEET_WIDTH_CM, lengthCm = i.lengthCm || SHEET_LENGTH_CM
  const qty = Math.max(0, Math.round(Number(i.qty) || 0))   // 0 допустим (обнуление при недостаче)
  const same = await findSheet(orgId, { ...i, widthCm, lengthCm })
  if (same) { const [u] = await repo.updateMaterialQty(same.id, qty); return { ok: true as const, piece: u } }
  const [p] = await repo.insertMaterialPiece({ orgId, warehouseId: i.warehouseId || null, productId: i.productId || null, color: i.color || '', widthCm: String(widthCm), lengthCm: String(lengthCm), qty, kind: 'sheet' })
  return { ok: true as const, piece: p }
}
