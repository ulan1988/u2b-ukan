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
