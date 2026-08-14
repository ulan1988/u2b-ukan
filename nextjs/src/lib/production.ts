// Правило раскроя (мастер-стол филиала-производителя).
// 1 лист = 125 см (ширина) × 200 см (длина). Аппарат режет ТОЛЬКО по ширине,
// поэтому длину 200 см не учитываем — считаем и продаём по см (ширине).
// Изделие занимает свои см ширины; сколько нужно листов = сумма см изделий ÷ 125.
export const SHEET_WIDTH_CM = 125     // ширина листа в см (режем по ней)
export const SHEET_LENGTH_CM = 200    // длина листа — не учитываем в расчёте (справочно)

// Сколько листов нужно на заданные см изделий (дробное).
export function sheetsForCm(totalCm: number): number {
  return SHEET_WIDTH_CM > 0 ? (Number(totalCm) || 0) / SHEET_WIDTH_CM : 0
}
// Сколько см изделий выходит из N листов.
export function cmForSheets(sheets: number): number {
  return (Number(sheets) || 0) * SHEET_WIDTH_CM
}

export interface ProdItem { cm: number; qty?: number }   // изделие: ширина в см (× кол-во, по умолчанию 1)

// Расчёт производства по строкам изделий. Возвращает суммарные см, листов (÷125) и
// целых листов (округление вверх — столько реально расходуется со склада).
export function productionCalc(items: ProdItem[]) {
  const totalCm = items.reduce((s, it) => s + (Number(it.cm) || 0) * (it.qty ?? 1), 0)
  const sheets = sheetsForCm(totalCm)
  return { totalCm, sheets, sheetsCeil: Math.ceil(sheets - 1e-9), sheetWidth: SHEET_WIDTH_CM }
}

// РАСКРОЙ (минимальный): куски изделий нельзя резать между листами, поэтому это задача
// упаковки (bin-packing). Best-Fit-Decreasing: сорт по убыванию, каждый кусок — в лист с
// наименьшим остатком, куда влезает; иначе новый лист. Возвращает минимальное число листов
// и остаток (обрезь) по каждому листу. Пример: 36+36+36+15=123 → остаток 2 см на лист.
export function packSheets(items: { cm: number; qty: number }[], sheetWidth = SHEET_WIDTH_CM) {
  const pieces: number[] = []
  let oversize = 0
  for (const it of items) {
    const w = Number(it.cm) || 0, n = Math.floor(Number(it.qty) || 0)
    if (w <= 0 || n <= 0) continue
    if (w > sheetWidth) { oversize += n; continue }   // шире листа — не режется
    for (let i = 0; i < n; i++) pieces.push(w)
  }
  pieces.sort((a, b) => b - a)
  const rem: number[] = []                            // остаток по каждому листу
  for (const p of pieces) {
    let best = -1, bestLeft = Infinity
    for (let i = 0; i < rem.length; i++) if (rem[i] >= p - 1e-9 && rem[i] - p < bestLeft) { best = i; bestLeft = rem[i] - p }
    if (best >= 0) rem[best] = Math.round((rem[best] - p) * 100) / 100
    else rem.push(Math.round((sheetWidth - p) * 100) / 100)
  }
  const usedCm = pieces.reduce((s, p) => s + p, 0)
  const wasteCm = rem.reduce((s, r) => s + r, 0)
  return { sheets: rem.length, remainders: rem, usedCm, wasteCm, maxRem: rem.length ? Math.max(...rem) : 0, oversize, sheetWidth, piecesCount: pieces.length }
}

// Раскрой ПО ЦВЕТАМ: лист одного цвета нельзя резать под изделие другого цвета, поэтому
// пакуем каждый цвет отдельно. Цвет берётся из изделия. Возвращает раскрой по каждому
// цвету + суммарно листов/обрезь.
export function packByColor(items: { color: string; cm: number; qty: number }[], sheetWidth = SHEET_WIDTH_CM) {
  const groups = new Map<string, { cm: number; qty: number }[]>()
  for (const it of items) {
    if (!(Number(it.cm) > 0) || !(Number(it.qty) > 0)) continue
    const c = (it.color || '').trim() || '—'
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push({ cm: it.cm, qty: it.qty })
  }
  const byColor = Array.from(groups.entries())
    .map(([color, its]) => ({ color, ...packSheets(its, sheetWidth) }))
    .sort((a, b) => b.sheets - a.sheets)
  return {
    byColor,
    totalSheets: byColor.reduce((s, g) => s + g.sheets, 0),
    totalWasteCm: byColor.reduce((s, g) => s + g.wasteCm, 0),
    totalUsedCm: byColor.reduce((s, g) => s + g.usedCm, 0),
    oversize: byColor.reduce((s, g) => s + g.oversize, 0),
  }
}
