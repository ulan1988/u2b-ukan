// Группы номенклатуры — как на старом проекте (ulkan).
export const PRODUCT_GROUPS = [
  'Водосток', 'Материалы', 'Евробрус', 'Комплектующие',
  'Металлочерепица', 'Проф лист', 'Услуги', 'Прочее',
]

export const PRODUCT_CATEGORIES = [
  { value: 'goods', label: 'Товар' },
  { value: 'material', label: 'Материал' },
  { value: 'service', label: 'Услуга' },
] as const

export const CONTRAGENT_KINDS = [
  { value: 'client', label: 'Заказчик' },
  { value: 'supplier', label: 'Поставщик' },
  { value: 'both', label: 'Оба (заказчик+поставщик)' },
] as const
