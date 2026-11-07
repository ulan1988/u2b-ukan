// Навигация по каталогу (папки · подпапки · толщина · цвет · поиск) — общая для
// каталога кассы (StoreCatalog) и фильтра в «Расчёте». Раньше жила внутри StoreCatalog;
// вынесена, чтобы оба экрана фильтровали номенклатуру ОДИНАКОВО.
import { extractRal } from './ral'
import { isIzdelie } from './lineAmount'

export const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
export const thickOf = (name: string) => { const m = (name || '').match(/(\d+(?:[.,]\d+)?)\s*мм/i); return m ? m[1].replace('.', ',') + 'мм' : '' }
export const THICK_SET = ['0,35мм', '0,4мм', '0,45мм']
export const KOMPLEKT_CHIPS = ['Изделие', 'J - профиль', 'H - профиль', 'Внут. угол (пр)', 'Нар. угол (пр)']

export interface Folder { key: string; label: string; match: (p: any) => boolean; levels: string[]; thickness?: boolean; build?: boolean }

export const FOLDERS: Folder[] = [
  { key: 'vodostok', label: 'Водосток', match: (p: any) => norm(p.group) === 'водосток', levels: ['cat', 'subgroup'] },
  { key: 'evrobrus', label: 'Евро брус', match: (p: any) => norm(p.cat) === 'евро брус', levels: ['subgroup'], thickness: true },
  { key: 'kompl', label: 'Комплект.', match: (p: any) => norm(p.cat).includes('комплект'), build: true, levels: ['subgroup'] },
  { key: 'material', label: 'Материалы', match: (p: any) => norm(p.group) === 'материалы', levels: [] },
  { key: 'cherep', label: 'Металлоч.', match: (p: any) => norm(p.cat) === 'металлочерепица', levels: ['subgroup'] },
]

// Прочие категории номенклатуры — папками справа от основных.
export function extraFolders(products: any[]): Folder[] {
  const covered = new Set(['водосток', 'евро брус', 'комплектующие', 'металлочерепица'])
  const cats = new Set<string>()
  for (const p of products) {
    const g = norm(p.group); if (g === 'водосток' || g === 'материалы' || g === 'услуги') continue
    const c = (p.cat || '').trim(); if (c && !covered.has(norm(c))) cats.add(c)
  }
  return Array.from(cats).sort((a, b) => a.localeCompare(b, 'ru'))
    .map(c => ({ key: 'cat:' + norm(c), label: c, match: (p: any) => norm(p.cat) === norm(c), levels: [] as string[] }))
}

// Ряды подпапок по уровням выбранной папки (показываем уровень, если вариантов больше одного).
export function subRowsOf(products: any[], folder: Folder, path: string[]) {
  const levels = folder.levels || []
  const rows: { level: number; field: string; vals: string[] }[] = []
  let scope = products.filter(folder.match)
  for (let i = 0; i < levels.length; i++) {
    const field = levels[i]
    const vals = Array.from(new Set(scope.map((p: any) => (p[field] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'))
    if (vals.length > 1) rows.push({ level: i, field, vals })
    if (path[i]) scope = scope.filter((p: any) => (p[field] || '').trim() === path[i]); else break
  }
  return rows
}

export function thicksOf(products: any[], folder: Folder, path: string[]) {
  if (!folder.thickness) return [] as string[]
  const levels = folder.levels || []
  let scope = products.filter(folder.match)
  for (let i = 0; i < levels.length; i++) if (path[i]) scope = scope.filter((p: any) => (p[levels[i]] || '').trim() === path[i])
  const present = new Set(scope.map((p: any) => thickOf(p.name)))
  return THICK_SET.filter(t => present.has(t))
}

export interface CatalogSel { folder: string; path: string[]; thick: string; color: string; kfilter: string }
export const emptySel = (folderKey = FOLDERS[0].key): CatalogSel => ({ folder: folderKey, path: [], thick: '', color: '', kfilter: '' })

// Отбор товаров: поиск по названию/алиасу идёт ПОВЕРХ выбранной папки (фильтр сверху),
// пустой поиск — просто содержимое папки. limit держит список коротким.
export function filterProducts(products: any[], folder: Folder, sel: CatalogSel, q: string, limit = 150) {
  const sQ = norm(q)
  const levels = folder.levels || []
  let base = products.filter(folder.match)
  for (let i = 0; i < levels.length; i++) if (sel.path[i]) base = base.filter((p: any) => { const v = (p[levels[i]] || '').trim(); return v === sel.path[i] || v === '' })
  if (sel.thick) base = base.filter((p: any) => thickOf(p.name) === sel.thick)
  if (folder.build) {
    base = base.filter(p => !extractRal(p.name))
    if (sel.kfilter) base = base.filter(p => norm(p.name) === norm(sel.kfilter))
    base = [...base].sort((a, b) => (isIzdelie(b.name) ? 1 : 0) - (isIzdelie(a.name) ? 1 : 0))
  } else if (sel.color) {
    base = base.filter(p => { const r = extractRal(p.name); return r === sel.color || !r })
  }
  if (sQ) base = base.filter(p => `${norm(p.name)} ${norm(p.alias || '')}`.includes(sQ))
  return base.slice(0, limit)
}
