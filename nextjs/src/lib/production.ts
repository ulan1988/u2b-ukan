// Правило раскроя (мастер-стол филиала-производителя).
// 1 лист = 125 см (ширина) × 200 см (длина). Аппарат режет ТОЛЬКО по ширине,
// поэтому длину 200 см не учитываем — считаем и продаём по см (ширине).
// Изделие занимает свои см ширины; сколько нужно листов = сумма см изделий ÷ 125.
export const SHEET_WIDTH_CM = 125     // ширина листа в см (режем по ней)
export const SHEET_LENGTH_CM = 200    // длина листа — не учитываем в расчёте (справочно)
export const MIN_REMNANT_CM = 4       // обрезь уже этого — в расход (не хранится как годный кусок)

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

// ── ОПТИМИЗАТОР РАСКРОЯ (порт cutting_calculator) ──────────────────────────────
// Генерит все валидные паттерны реза для листа и жадно подбирает минимальный набор
// листов на КАЖДЫЙ цвет. Даёт листы с сегментами (для визуализации), обрезь и КПД.
export interface CutItemIn { name: string; color: string; cm: number; qty: number }
export interface CutSeg { cm: number; name: string; ci: number }
export interface CutSheet { segs: CutSeg[]; waste: number; good?: number; scrap?: number; kind?: string; pieces?: number[] }
export interface CutColor { color: string; sheets: CutSheet[]; count: number; waste: number; eff: number; good?: number; scrap?: number; items: { name: string; cm: number; qty: number }[] }
// «Умный» план остатка (из калькулятора): остаток r см на листе, где можно снять cap см
// с деталей (pcs×допуск). useful = стандартные изделия (см). Возвращает годную часть/мусор.
export interface CutOpts { useful?: number[]; tol?: number; grow?: number }
function remnantPlan(r: number, cap: number, useful: number[], grow: number) {
  if (r <= 1e-9) return { good: 0, scrap: 0, kind: 'zero', pieces: [] as number[] }
  if (r <= grow && r <= cap) return { good: 0, scrap: 0, kind: 'zero', pieces: [] as number[] }   // растянули детали → лист в ноль
  const U = useful.find(u => u >= r && u - r <= cap)                                               // заузили под стандарт
  if (U) return { good: U, scrap: 0, kind: 'useful', pieces: [U] }
  const desc = [...useful].sort((a, b) => b - a)                                                   // вырезали полезные куски из остатка
  let cur = r, good = 0; const pieces: number[] = []
  for (let g = 0; g < 50; g++) { const u = desc.find(x => x <= cur); if (!u) break; pieces.push(u); good += u; cur -= u }
  if (good > 0) return { good, scrap: Math.round(cur * 100) / 100, kind: 'part', pieces }
  return { good: 0, scrap: r, kind: 'dirty', pieces: [] as number[] }
}

// Все паттерны реза (мультимножества кусков, влезающие в лист SL с зазором GAP).
// Одиночные паттерны добавляем всегда — гарантия полного покрытия даже при обрыве по cap.
function genPatterns(items: { w: number }[], SL: number, GAP: number, cap = 200000) {
  const n = items.length
  const valid: { counts: number[]; waste: number }[] = []
  const seen = new Set<string>()
  let nodes = 0
  const add = (cur: number[], rem: number) => {
    const key = cur.join(',')
    if (!seen.has(key) && cur.some(c => c > 0)) { seen.add(key); valid.push({ counts: [...cur], waste: Math.round(rem * 100) / 100 }) }
  }
  const gen = (i: number, rem: number, cur: number[]) => {
    if (nodes++ > cap) return
    add(cur, rem)
    for (let j = i; j < n; j++) {
      const cut = items[j].w + (cur.reduce((s, c) => s + c, 0) > 0 ? GAP : 0)
      if (rem >= cut) { cur[j]++; gen(j, rem - cut, cur); cur[j]-- }
    }
  }
  gen(0, SL, new Array(n).fill(0))
  for (let i = 0; i < n; i++) { const cur = new Array(n).fill(0); cur[i] = 1; add(cur, SL - items[i].w) }
  return valid
}

// Жадный подбор паттернов под нужные количества (минимум обрези).
function solveGroup(items: { w: number; q: number }[], SL: number, GAP: number) {
  const patterns = genPatterns(items, SL, GAP)
  const n = items.length
  const remaining = items.map(it => it.q)
  const used: { counts: number[]; waste: number }[] = []
  const sorted = [...patterns].sort((a, b) => a.waste - b.waste)
  let guard = 0
  while (remaining.some(r => r > 0) && guard++ < 100000) {
    let best: { p: { counts: number[]; waste: number }; times: number } | null = null, bestScore = -1
    for (const p of sorted) {
      let useful = false
      for (let i = 0; i < n; i++) if (p.counts[i] > 0 && remaining[i] > 0) { useful = true; break }
      if (!useful) continue
      let times = Infinity
      for (let i = 0; i < n; i++) if (p.counts[i] > 0) times = Math.min(times, Math.ceil(remaining[i] / p.counts[i]))
      times = Math.max(1, times)
      let covered = 0
      for (let i = 0; i < n; i++) covered += Math.min(p.counts[i] * times, remaining[i]) * items[i].w
      const score = covered / (p.waste + 0.1)
      if (score > bestScore) { bestScore = score; best = { p, times } }
    }
    if (!best) break
    let maxT = Infinity
    for (let i = 0; i < n; i++) if (best.p.counts[i] > 0) maxT = Math.min(maxT, Math.ceil(remaining[i] / best.p.counts[i]))
    for (let t = 0; t < Math.max(1, maxT); t++) {
      used.push({ counts: [...best.p.counts], waste: best.p.waste })
      for (let i = 0; i < n; i++) remaining[i] = Math.max(0, remaining[i] - best.p.counts[i])
    }
  }
  return used
}

export function optimizeCut(items: CutItemIn[], sheetWidth = SHEET_WIDTH_CM, gap = 0, opts: CutOpts = {}) {
  const useful = (opts.useful || []).filter(u => u > 0).sort((a, b) => a - b)
  const tol = opts.tol ?? 0.2, grow = opts.grow ?? 0.3   // допуск/растяжка по умолчанию (см)
  const smart = useful.length > 0
  const groups = new Map<string, CutItemIn[]>()
  let oversize = 0
  for (const it of items) {
    const w = Number(it.cm) || 0, q = Math.floor(Number(it.qty) || 0)
    if (w <= 0 || q <= 0) continue
    if (w > sheetWidth) { oversize += q; continue }
    const c = (it.color || '').trim() || '—'
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push({ name: it.name, color: c, cm: w, qty: q })
  }
  const byColor: CutColor[] = []
  let totalSheets = 0, totalWaste = 0, totalGood = 0, totalScrap = 0
  for (const [color, its] of Array.from(groups.entries())) {
    const used = solveGroup(its.map(it => ({ w: it.cm, q: it.qty })), sheetWidth, gap)
    const sheets: CutSheet[] = used.map(p => {
      const segs: CutSeg[] = []
      its.forEach((it, ii) => { for (let k = 0; k < p.counts[ii]; k++) segs.push({ cm: it.cm, name: it.name, ci: ii }) })
      const sh: CutSheet = { segs, waste: p.waste }
      if (smart) {
        const pcs = p.counts.reduce((a, b) => a + b, 0)
        const plan = remnantPlan(p.waste, pcs * tol, useful, grow)   // остаток → в дело/мусор по стандартам
        sh.good = plan.good; sh.scrap = plan.scrap; sh.kind = plan.kind; sh.pieces = plan.pieces
      }
      return sh
    })
    const count = sheets.length
    const waste = Math.round(sheets.reduce((s, sh) => s + sh.waste, 0) * 100) / 100
    const eff = count ? Math.round((1 - waste / (count * sheetWidth)) * 100) : 0
    const good = Math.round(sheets.reduce((s, sh) => s + (sh.good || 0), 0) * 100) / 100
    const scrap = Math.round(sheets.reduce((s, sh) => s + (sh.scrap || 0), 0) * 100) / 100
    totalSheets += count; totalWaste += waste; totalGood += good; totalScrap += scrap
    byColor.push({ color, sheets, count, waste, eff, good, scrap, items: its.map(it => ({ name: it.name, cm: it.cm, qty: it.qty })) })
  }
  byColor.sort((a, b) => b.count - a.count)
  totalWaste = Math.round(totalWaste * 100) / 100
  totalGood = Math.round(totalGood * 100) / 100; totalScrap = Math.round(totalScrap * 100) / 100
  const totalEff = totalSheets ? Math.round((1 - totalWaste / (totalSheets * sheetWidth)) * 100) : 0
  // % мусора (реальная потеря) — при умном режиме: только настоящий мусор, а не полезные остатки.
  const scrapPct = totalSheets ? Math.round((smart ? totalScrap : totalWaste) / (totalSheets * sheetWidth) * 1000) / 10 : 0
  return { byColor, totalSheets, totalWaste, totalEff, totalGood, totalScrap, scrapPct, smart, oversize, sheetWidth }
}
