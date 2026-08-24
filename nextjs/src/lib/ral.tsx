// RAL-система цветов (из Улкана 1:1). Палитра владельца + RalDot + extractRal.
export interface RalColor { code: string; name: string; hex?: string; bg?: string; query?: string }

export const RAL_COLORS: RalColor[] = [
  { code: '1015', name: 'Бежевый', hex: '#E6D690', query: 'бежев' },
  { code: '1018', name: 'Жёлтый', hex: '#F8D338', query: 'желт' },
  { code: '9003', name: 'Белый', hex: '#F4F8F4', query: 'белый' },
  { code: '7004', name: 'Светло-серый', hex: '#9EA0A1', query: 'серый' },
  { code: '7024', name: 'Серый графит', hex: '#45494E', query: 'серый' },
  { code: '7024М', name: 'Графит матовый', hex: '#3b3f44', query: 'серый мат' },
  { code: '8017', name: 'Шоколадный', hex: '#442F29', query: 'шоколад' },
  { code: '8017М', name: 'Шоколад матовый', hex: '#3a2823', query: 'шоколад мат' },
  { code: '8019', name: 'Серо-коричневый', hex: '#3D3635', query: 'коричнев' },
  { code: '2004', name: 'Оранжевый', hex: '#E75B12', query: 'оранж' },
  { code: '6005', name: 'Зелёный', hex: '#0F4336', query: 'зелен' },
  { code: '6007', name: 'Тёмно-зелёный', hex: '#26392F', query: 'зелен' },
  { code: '3005', name: 'Красное вино', hex: '#5E2028', query: 'вино' },
  { code: '3020', name: 'Красный', hex: '#C1121C', query: 'красн' },
  { code: '5005', name: 'Сигнально-синий', hex: '#154889', query: 'син' },
  { code: 'decor', name: 'Дерево', bg: 'repeating-linear-gradient(45deg,#5C4033 0 4px,#7a5a44 4px 7px)', query: 'дерев' },
]

export const RAL_BY_CODE: Record<string, RalColor> = Object.fromEntries(RAL_COLORS.map(c => [c.code, c]))

// Избранные (ходовые) цвета — показываем всегда сверху; остальные прячем под «глазок».
export const FAVORITE_RAL = ['9003', '7024', '7024М', '7004', '8017', '8017М', '1015', '2004']
// Порядок цветов для модельки: сначала избранные, при showAll — дальше остальные.
export function ralOrdered(showAll: boolean): RalColor[] {
  const favs = FAVORITE_RAL.map(code => RAL_BY_CODE[code]).filter(Boolean)
  if (!showAll) return favs
  return [...favs, ...RAL_COLORS.filter(c => !FAVORITE_RAL.includes(c.code))]
}

// Извлечь RAL-код из имени: RAL 1234 или голый 4-значный код из палитры.
export function extractRal(name: string): string {
  const s = name || ''
  const m = s.match(/RAL\s?(\d{4})/i)
  if (m) return m[1]
  // матовый код (напр. 8017М) — проверяем раньше глянцевого
  const mm = s.match(/(\d{4})\s?[МM](?![0-9])/)
  if (mm && RAL_BY_CODE[mm[1] + 'М']) return mm[1] + 'М'
  const bare = s.match(/(\d{4})/)
  if (bare && RAL_BY_CODE[bare[1]]) return bare[1]
  return ''
}

// RalDot — круглый чип цвета.
export function RalDot({ code, size = 16, title }: { code?: string; size?: number; title?: string }) {
  const c = code ? RAL_BY_CODE[code] : null
  if (!c) return null
  return <span title={title || c.name} style={{ width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: c.bg || c.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />
}
