// Единая модель категорий номенклатуры (из Улкана 1:1). group → cat → subgroup.
// Используется каталогом-пикером и автоподстановкой поставщик/логист по группе.
export type NomTree = Record<string, Record<string, string[]>>

export const NOM_CATALOG_TREE: NomTree = {
  'Водосток': {
    'Дёке люкс': [], 'Дёке премиум': [], 'Дёке серый люкс': [], 'Дёке стандарт': [],
    'Модерн бюджет 7024': [], 'Модерн бюджет 8017': [], 'Модерн бюджет 9003': [],
  },
  'Готовая продукция': {},
  'Материалы': {},
  'Товары': {
    'Армстронг': [],
    'Евро брус': ['Металл профиль', 'Меллиус', 'КМК', 'Разные'],
    'Комплектующие': ['1015', '2004', '3005', '5005', '7004', '7024', '8017', '9003', 'Без цвета', 'Жёлтый', 'Тёмное дерево'],
    'Корабельный брус': [], 'Крепежные материалы': [], 'Ленарная панель': [],
    'Металлочерепица': ['Андалузия 7024', 'Андалузия 8019', 'Зелёный 6007', 'Красный 3005', 'Серый 7024', 'Шоколадный 8017'],
    'Проф лист С8': [],
  },
  'Услуги': {},
}

export const catalogGroups = (): string[] => Object.keys(NOM_CATALOG_TREE)
export const catalogCats = (g: string): string[] => Object.keys(NOM_CATALOG_TREE[g] || {})
export const catalogSubs = (g: string, c: string): string[] => NOM_CATALOG_TREE[g]?.[c] || []

export interface CatalogCat { key: string; label: string; group: string; cat: string }
export const CATALOG_CATEGORIES: CatalogCat[] = [
  { key: 'vodostok', label: 'Водосток', group: 'Водосток', cat: '' },
  { key: 'materialy', label: 'Материалы', group: 'Материалы', cat: '' },
  { key: 'eurobrus', label: 'Евробрус', group: 'Товары', cat: 'Евро брус' },
  { key: 'komplekt', label: 'Комплектующие', group: 'Товары', cat: 'Комплектующие' },
]

const normCat = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

// Категория каталога по полям group/cat (устойчиво к перепутанным полям 1С).
export function matchCategoryKey(group: string, cat: string): string | null {
  const g = normCat(group), c = normCat(cat)
  if (!g && !c) return null
  for (const cc of CATALOG_CATEGORIES) {
    const cg = normCat(cc.group), ck = normCat(cc.cat)
    if (cc.cat) {
      if ((g === cg && c === ck) || (g === ck && c === cg)) return cc.key
    } else {
      if (g === cg || c === cg) return cc.key
    }
  }
  return null
}
