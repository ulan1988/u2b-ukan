// Презентационные хелперы для новой формы заявки (kind/positions). Вид — как у Улкана,
// но данные из нашего бэкенда.
import type { CSSProperties } from 'react'
import { COLORS } from './colors'

export const isPurchase = (o: any) => o?.kind === 'purchase'
export const kindLabel = (o: any) => (isPurchase(o) ? 'ЗАКУП' : 'ПРОДАЖА')

export const cardSum = (o: any) =>
  (o.positions || []).reduce((s: number, p: any) => s + Number(p.qty || 0) * Number(p.price || 0), 0)

// Процент готовности позиции по статусу (как PCT в Улкане 1:1).
export const PCT: Record<string, number> = {
  'В работе': 10, 'Готово к отгрузке': 60, 'В пути': 80, 'Доставлено': 100, 'Принято филиалом': 40, '': 0,
}
export const posPct = (p: any) => PCT[p.status] ?? 0

export const cardProgress = (o: any) => {
  const ps = o.positions || []
  if (!ps.length) return o.status === 'Доставлено' ? 100 : 0
  return Math.round(ps.reduce((s: number, p: any) => s + posPct(p), 0) / ps.length)
}

export const barColor = (pct: number) => (pct >= 100 ? COLORS.progress.high : pct >= 50 ? COLORS.progress.mid : COLORS.progress.low)
export const fmtMoney = (n: number) => Number(n || 0).toLocaleString('ru-RU')
export const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '')

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  'В ожидании': COLORS.status.waiting, 'Принят': COLORS.status.accepted, 'В обработке': COLORS.status.accepted,
  'В работе': COLORS.status.ready, 'К учёту': COLORS.status.delivered, 'В бухгалтерии': COLORS.status.delivered,
  'Отменён': COLORS.status.cancelled, 'Восстановлен': COLORS.status.accepted, 'Архив': COLORS.status.archive,
  'К выполнению': { bg: '#f3eeff', color: '#7a3aaa' }, 'Выполнено': COLORS.status.ready,
  'Производство': { bg: '#f3eeff', color: '#7a3aaa' }, 'Изготовлено': COLORS.status.ready,   // старые (совместимость)
}
export function statusStyle(status: string): CSSProperties {
  const c = STATUS_MAP[status] || COLORS.status.draft
  return { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, whiteSpace: 'nowrap' }
}

export const isOverdue = (o: any) =>
  o.deadline && !o.delivered && new Date(o.deadline) < new Date() && o.screen !== 'archive' && !o.isCancelled

export function sourceStyle(source: string): CSSProperties {
  const s = (COLORS as any).source[source] || (COLORS as any).source.cabinet
  return { fontSize: 10, padding: '1px 8px', borderRadius: 20, fontWeight: 600, background: s.bg, color: s.color }
}
export const sourceLabel = (s: string) =>
  ({ cabinet: 'Кабинет', external: 'Внешняя', webhook: 'Вебхук', admin_manual: 'Админ', responsible_portal: 'Портал', portal: 'Портал' } as Record<string, string>)[s] || s
