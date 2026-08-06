// Надстройки-уровни NomPicker поверх групп каталога — из Улкана 1:1.
export interface NomItem { key: string; label: string; terms?: string[]; measure?: boolean; exclude?: string[] }
export interface NomLevel { key: string; label: string; items: NomItem[] }

const thicknessEuro: NomLevel = { key: 'thick', label: 'Толщина', items: [{ key: 't035', label: '0,35' }, { key: 't04', label: '0,4' }, { key: 't045', label: '0,45' }] }
const accessoryKinds: NomLevel = {
  key: 'kind', label: 'Вид', items: [
    { key: 'h', label: 'H - профиль', terms: ['H - профиль'] }, { key: 'j', label: 'J - профиль', terms: ['J - профиль'] },
    { key: 'outer_r', label: 'Нар. угол (пр)', terms: ['Нар. угол (пр)'] }, { key: 'outer_l', label: 'Нар. угол (сл)', terms: ['Нар. угол (сл)'] },
    { key: 'inner_r', label: 'Внут. угол (пр)', terms: ['Внут. угол (пр)'] }, { key: 'inner_l', label: 'Внут. угол (сл)', terms: ['Внут. угол (сл)'] },
    { key: 'item', label: 'Изделие · см', measure: true, terms: ['Изделие'] },
  ],
}
const thicknessFlat: NomLevel = { key: 'thick', label: 'Толщина', items: [{ key: 't02', label: '0,2' }, { key: 't025', label: '0,25' }, { key: 't04', label: '0,4' }, { key: 't045', label: '0,45' }] }
const coating: NomLevel = { key: 'coat', label: 'Покрытие', items: [{ key: 'mat', label: 'Мат', terms: ['мат'] }, { key: 'glyan', label: 'Глян', terms: ['глян'] }] }

const OVERLAYS: Record<string, NomLevel[]> = {
  'евро брус': [thicknessEuro], 'евробрус': [thicknessEuro], 'комплектующие': [accessoryKinds],
  'плоский лист': [thicknessFlat, coating], 'материалы': [thicknessFlat, coating],
}
export function overlayFor(name: string): NomLevel[] { return OVERLAYS[(name || '').trim().toLowerCase()] || [] }

export interface Producer { key: string; label: string; hint: string; subgroup: string }
export const EUROBRUS_PRODUCERS: Producer[] = [
  { key: 'mp', label: 'МП', hint: 'Металл Профиль', subgroup: 'Металл профиль' },
  { key: 'ap', label: 'АП', hint: 'Меллиус', subgroup: 'Меллиус' },
  { key: 'kmk', label: 'КМК', hint: 'КМК', subgroup: 'КМК' },
  { key: 'mb', label: 'МБ', hint: 'Китай', subgroup: 'Разные' },
]
export function producersFor(cat: string): Producer[] {
  return (cat || '').trim().toLowerCase().replace(/ё/g, 'е') === 'евро брус' ? EUROBRUS_PRODUCERS : []
}
