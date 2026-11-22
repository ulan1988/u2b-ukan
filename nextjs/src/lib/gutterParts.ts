// Детали водостока «Модерн бюджет» ↔ товары номенклатуры. Схема (lib/gutter3d) знает только вид детали,
// а какой это товар в выбранном RAL — решается здесь, по имени из номенклатуры (ничего не выдумываем:
// товара нет — деталь на схеме помечается «нет», количество в неё не вписать).
import { extractRal, RAL_BY_CODE } from '@/lib/ral'
import type { GutterKind, GutterPalette } from '@/lib/gutter3d'

export const GUTTER_CAT = 'модерн бюджет'
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/x/g, 'х').replace(/\s+/g, ' ')
const has = (...w: string[]) => (n: string) => w.every(x => n.includes(x))

export interface GutterPart { id: GutterKind; title: string; test: (n: string) => boolean; fallbackRal?: string }
// Порядок = порядок строк под схемой: сверху вниз по ходу воды.
export const GUTTER_PARTS: GutterPart[] = [
  { id: 'gutter', title: 'Желоб', test: n => n.startsWith('желоб') && n.includes('120х86') },
  { id: 'hold', title: 'Кронштейн', test: has('держатель желоба', 'х295') },
  // владелец 22.11.2026: карнизный держатель привязан к «Держатель желоба 9003 карнизный 120х86х146 (3мм)» —
  // в цвете, где своего карнизного нет (8017), подставляется он
  { id: 'holdk', title: 'Кронштейн короткий', test: has('держатель желоба', 'карниз'), fallbackRal: '9003' },
  { id: 'capl', title: 'Заглушка левая', test: has('заглушка желоба', 'лев') },
  { id: 'capr', title: 'Заглушка правая', test: has('заглушка желоба', 'прав') },
  { id: 'cout', title: 'Угол наружный', test: n => n.includes('угол желоба') && n.includes('наружн') && !n.includes('чп') },
  { id: 'cin', title: 'Угол внутренний', test: n => n.includes('угол желоба') && n.includes('внутрен') && !n.includes('чп') },
  { id: 'funnel', title: 'Воронка', test: has('воронка выпускная') },
  { id: 'pipe', title: 'Труба', test: has('труба водосточная', '76х102') },
  { id: 'clamp', title: 'Хомут на кирпич', test: has('держатель трубы', 'кирпич') },
  { id: 'elbow', title: 'Колено', test: has('колено трубы') },
]

// Убрано из меню по слову владельца (22.11.2026), но живёт в базе: 3D-модель в движке и правило поиска
// товара целы. Вернуть — перенести строку обратно в GUTTER_PARTS и убрать вид из GUTTER_HIDDEN.
export const GUTTER_SPARE: GutterPart[] = [
  { id: 'clampw', title: 'Хомут на дерево', test: has('держатель трубы', 'дерев') },
]
export const GUTTER_HIDDEN: GutterKind[] = GUTTER_SPARE.map(p => p.id)

export const isGutterCat = (p: any) => norm(p.group) === 'водосток' && norm(p.cat) === GUTTER_CAT

// RAL-папки серии: подгруппы «Модерн бюджет 9003 / 7024 / 8017» (порядок — как в меню).
const RAL_ORDER = ['9003', '7024', '8017']
export function gutterRals(products: any[]): { ral: string; sub: string }[] {
  const m = new Map<string, string>()
  for (const p of products) { if (!isGutterCat(p)) continue; const sub = (p.subgroup || '').trim(); const r = (sub.match(/(\d{4}М?)\s*$/i) || [])[1]; if (r && !m.has(r)) m.set(r, sub) }
  const pos = (r: string) => { const i = RAL_ORDER.indexOf(r); return i < 0 ? 99 : i }
  return Array.from(m, ([ral, sub]) => ({ ral, sub })).sort((a, b) => pos(a.ral) - pos(b.ral) || a.ral.localeCompare(b.ral))
}

// Товар детали в выбранном RAL: сначала этого цвета, иначе безцветный («(ЦВ)» — один на все цвета).
export function gutterProduct(products: any[], part: GutterPart, ral: string): any | undefined {
  const c = products.filter(p => isGutterCat(p) && part.test(norm(p.name)))
  return c.find(p => extractRal(p.name) === ral) || c.find(p => !extractRal(p.name))
    || (part.fallbackRal ? c.find(p => extractRal(p.name) === part.fallbackRal) : undefined)
}

// Подпись на схеме — наш алиас; RAL в конце убираем (он выбран папкой сверху).
export function gutterLabel(part: GutterPart, product: any | undefined, ral: string): string {
  const a = ((product && product.alias) || '').trim()
  return (a ? a.replace(new RegExp('\s*' + ral + '\s*$', 'i'), '').trim() : '') || part.title
}

// Цвет деталей и подходящий фон: светлому металлу — тёмный фон, тёмному — светлый.
export function gutterTheme(ral: string): { palette: GutterPalette; bg: string; ink: string; hex: string; name: string } {
  const c = RAL_BY_CODE[ral], hex = (c && c.hex) || '#8a8f94'
  const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
  const sh = (k: number) => '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x * k))).toString(16).padStart(2, '0')).join('')
  return light
    ? { palette: { out: hex, inn: sh(0.84), line: sh(0.5) }, bg: 'linear-gradient(180deg,#5d6872,#4a545d)', ink: '#ffffff', hex, name: (c && c.name) || ral }
    : { palette: { out: hex, inn: '#eef0ed', line: sh(0.45) }, bg: `linear-gradient(180deg,#f3f1ee,${r > b + 12 ? '#e9e1d8' : '#e2e6ea'})`, ink: '#2b2f33', hex, name: (c && c.name) || ral }
}
