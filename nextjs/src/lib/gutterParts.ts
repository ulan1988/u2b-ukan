// Детали водостока ↔ товары номенклатуры. Схема (lib/gutter3d) знает только вид детали, а какой это
// товар в выбранной папке (RAL у «Модерн бюджет», класс у «Дёке») — решается здесь, по имени из
// номенклатуры. Ничего не выдумываем: товара нет — деталь на схеме серая, количество в неё не вписать.
import { extractRal, RAL_BY_CODE } from '@/lib/ral'
import type { GutterKind, GutterPalette, GutterSystemId } from '@/lib/gutter3d'

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/x/g, 'х').replace(/\s+/g, ' ')
const has = (...w: string[]) => (n: string) => w.every(x => n.includes(x))
const starts = (w: string) => (n: string) => n.startsWith(w)

export interface GutterPart { id: GutterKind; title: string; test: (n: string) => boolean; fallbackRal?: string }
// Папка серии: RAL («9003») или класс («Люкс»). hex — цвет деталей на схеме.
export interface GutterFolder { key: string; sub: string; title: string; note: string; hex: string }
export interface GutterSystem {
  id: GutterSystemId; title: string
  cat: string                       // категория номенклатуры (нормализованная), группа — «Водосток»
  parts: GutterPart[]               // порядок = порядок строк под схемой
  hidden: GutterKind[]              // виды, убранные из меню (модель в движке остаётся)
  saveKey: string                   // где помним выбранную папку на устройстве
  folders: (products: any[]) => GutterFolder[]
  product: (products: any[], part: GutterPart, folder: GutterFolder) => any | undefined
  label: (part: GutterPart, product: any | undefined, folder: GutterFolder) => string
}
const inCat = (p: any, cat: string) => norm(p.group) === 'водосток' && norm(p.cat) === cat

// ── «Модерн бюджет»: желоб 120×86, труба 76×102; папки — RAL ───────────────────────────────────
const BUDGET_PARTS: GutterPart[] = [
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
// товара целы. Вернуть — перенести строку обратно в BUDGET_PARTS (вид сам уйдёт из hidden).
export const GUTTER_SPARE: GutterPart[] = [
  { id: 'clampw', title: 'Хомут на дерево', test: has('держатель трубы', 'дерев') },
]
const RAL_ORDER = ['9003', '7024', '8017']
const BUDGET: GutterSystem = {
  id: 'budget', title: 'Модерн бюджет', cat: 'модерн бюджет', parts: BUDGET_PARTS, hidden: GUTTER_SPARE.map(p => p.id), saveKey: 'u2b_vodostok_ral',
  // RAL-папки серии: подгруппы «Модерн бюджет 9003 / 7024 / 8017» (порядок — как в меню).
  folders(products) {
    const m = new Map<string, string>()
    for (const p of products) { if (!inCat(p, this.cat)) continue; const sub = (p.subgroup || '').trim(); const r = (sub.match(/(\d{4}М?)\s*$/i) || [])[1]; if (r && !m.has(r)) m.set(r, sub) }
    const pos = (r: string) => { const i = RAL_ORDER.indexOf(r); return i < 0 ? 99 : i }
    return Array.from(m, ([ral, sub]) => ({ key: ral, sub, title: ral, note: (RAL_BY_CODE[ral] || {}).name || '', hex: (RAL_BY_CODE[ral] || {}).hex || '#8a8f94' }))
      .sort((a, b) => pos(a.key) - pos(b.key) || a.key.localeCompare(b.key))
  },
  // Товар детали в выбранном RAL: сначала этого цвета, иначе безцветный («(ЦВ)» — один на все цвета).
  product(products, part, folder) {
    const c = products.filter(p => inCat(p, this.cat) && part.test(norm(p.name)))
    return c.find(p => extractRal(p.name) === folder.key) || c.find(p => !extractRal(p.name))
      || (part.fallbackRal ? c.find(p => extractRal(p.name) === part.fallbackRal) : undefined)
  },
  // Подпись на схеме — наш алиас; RAL в конце убираем (он выбран папкой сверху).
  label(part, product, folder) {
    const a = ((product && product.alias) || '').trim()
    return (a ? a.replace(new RegExp('\\s*' + folder.key + '\\s*$', 'i'), '').trim() : '') || part.title
  },
}

// ── «Дёке»: полукруглый желоб, круглая труба; папки — классы (подгруппы «Дёке стандарт / премиум / люкс / серый люкс»)
const DOCKE_PARTS: GutterPart[] = [
  { id: 'dg', title: 'Желоб', test: starts('желоб') },
  { id: 'dconn', title: 'Соединитель', test: starts('соединитель') },
  { id: 'dbr', title: 'Кронштейн', test: starts('кронштейн желоба') },
  { id: 'dbrm', title: 'Кронштейн металл', test: starts('кронштейн металл') },
  { id: 'dcap', title: 'Заглушка', test: starts('заглушка') },
  { id: 'dc90', title: 'Угол 90', test: has('угловой элемент 90') },
  { id: 'dc135', title: 'Угол 135', test: has('угловой элемент 135') },
  { id: 'dfun', title: 'Воронка', test: starts('воронка') },
  { id: 'dpipe', title: 'Труба', test: starts('труба') },
  { id: 'dclamp', title: 'Хомут', test: starts('хомут') },
  { id: 'dmuf', title: 'Муфта', test: starts('муфта') },
  { id: 'del72', title: 'Колено 72', test: starts('колено 72') },
  { id: 'del45', title: 'Колено 45', test: starts('колено 45') },
  { id: 'dtip', title: 'Наконечник', test: starts('наконечник') },
]
// Размер класса (желоб/труба, мм) — по каталогу Döcke; цвет на схеме условный: серый люкс — графит, остальные — шоколад.
const DOCKE_CLASS: { test: (k: string) => boolean; title: string; note: string; hex: string }[] = [
  { test: k => k.includes('стандарт'), title: 'Стандарт', note: '120/80', hex: '#4b3028' },
  { test: k => k.includes('премиум'), title: 'Премиум', note: '120/85', hex: '#4b3028' },
  { test: k => k.includes('люкс') && !k.includes('сер'), title: 'Люкс', note: '141/100', hex: '#4b3028' },
  { test: k => k.includes('люкс') && k.includes('сер'), title: 'Люкс серый', note: '141/100', hex: '#45494E' },
]
const DOCKE: GutterSystem = {
  id: 'docke', title: 'Дёке', cat: 'деке', parts: DOCKE_PARTS, hidden: [], saveKey: 'u2b_vodostok_docke',
  folders(products) {
    const subs = new Map<string, string>()
    for (const p of products) { if (!inCat(p, this.cat)) continue; const sub = (p.subgroup || '').trim(); if (sub && !subs.has(norm(sub))) subs.set(norm(sub), sub) }
    const out: GutterFolder[] = []
    for (const c of DOCKE_CLASS) for (const [k, sub] of Array.from(subs)) if (c.test(k)) out.push({ key: k, sub, title: c.title, note: c.note, hex: c.hex })
    return out
  },
  product(products, part, folder) {
    return products.find(p => inCat(p, this.cat) && norm(p.subgroup) === folder.key && part.test(norm(p.name)))
  },
  // Алиас у Дёке несёт класс («Желоб Дёке люкс») — класс выбран папкой, поэтому в подписи его срезаем.
  label(part, product) {
    const a = ((product && product.alias) || '').trim()
    return (a ? a.replace(/\s*(серый\s+)?д[её]ке.*$/i, '').trim() : '') || part.title
  },
}

export const GUTTER_SYSTEMS: GutterSystem[] = [BUDGET, DOCKE]
// Категория серии, как она записана в номенклатуре («Модерн бюджет», «Дёке»), иначе ''.
export const gutterCatName = (products: any[], sys: GutterSystem) => (((products.find(p => inCat(p, sys.cat)) || {}).cat || '') as string).trim()

// Цвет деталей и подходящий фон: светлому металлу — тёмный фон, тёмному — светлый.
export function gutterTheme(hex0: string): { palette: GutterPalette; bg: string; ink: string } {
  const hex = /^#[0-9a-f]{6}$/i.test(hex0) ? hex0 : '#8a8f94'
  const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
  const sh = (k: number) => '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x * k))).toString(16).padStart(2, '0')).join('')
  return light
    ? { palette: { out: hex, inn: sh(0.84), line: sh(0.5) }, bg: 'linear-gradient(180deg,#5d6872,#4a545d)', ink: '#ffffff' }
    : { palette: { out: hex, inn: '#eef0ed', line: sh(0.45) }, bg: `linear-gradient(180deg,#f3f1ee,${r > b + 12 ? '#e9e1d8' : '#e2e6ea'})`, ink: '#2b2f33' }
}
