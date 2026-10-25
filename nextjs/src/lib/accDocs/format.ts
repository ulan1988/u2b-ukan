// Дата для печатных форм: ISO → «ДД.ММ.ГГГГ» (строку режем как текст, без сдвига часового пояса).
const pad = (n: number) => String(n).padStart(2, '0')
export function formatDate(d?: string | number | Date | null): string {
  if (d == null || d === '') return ''
  if (typeof d === 'string') {
    const p = d.slice(0, 10).split('-')
    if (p.length === 3 && p[0].length === 4) return `${p[2]}.${p[1]}.${p[0]}`
  }
  const dt = new Date(d as string | number | Date)
  return isNaN(dt.getTime()) ? '' : `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`
}
