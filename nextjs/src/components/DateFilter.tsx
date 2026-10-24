'use client'
// Фильтр по дате просмотра — портирован из Улкана 1:1.
import type { CSSProperties } from 'react'

const PRIMARY = '#d4613a'
export type Period = 'all' | 'today' | 'yesterday' | 'week' | 'month'

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function inPeriod(date: string | Date | null | undefined, period: Period, day: string): boolean {
  if (day) {
    if (!date) return false
    return sameDay(new Date(date), new Date(day))
  }
  if (period === 'all') return true
  if (!date) return false
  const d = new Date(date), now = new Date()
  if (period === 'today') return sameDay(d, now)
  if (period === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); return sameDay(d, y) }
  const ms = now.getTime() - d.getTime()
  if (period === 'week') return ms <= 7 * 864e5 && ms >= -864e5
  if (period === 'month') return ms <= 30 * 864e5 && ms >= -864e5
  return true
}

export default function DateFilter({ period, day, onChange, dark }: { period: Period; day: string; onChange: (period: Period, day: string) => void; dark?: boolean }) {
  const chipStyle = (on: boolean): CSSProperties => ({ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: on ? PRIMARY : '#f1efec', color: on ? '#fff' : '#6b655b' })
  const opts: [Period, string][] = [['today', 'Сегодня'], ['yesterday', 'Вчера'], ['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё']]
  return (
    <div style={dark ? { display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' } : { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      {!dark && <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600, marginRight: 2 }}>📅</span>}
      {opts.map(([p, label]) => { const on = !day && period === p; return <button key={p} onClick={() => onChange(p, '')} style={dark ? { ...chipStyle(on), padding: '6px 11px', whiteSpace: 'nowrap', flexShrink: 0, background: on ? PRIMARY : '#3a3632', color: on ? '#fff' : '#d6d0c6' } : chipStyle(on)}>{label}</button> })}
      <input type="date" value={day} onChange={e => onChange(period, e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${day ? PRIMARY : '#e6e2dc'}`, fontSize: 12.5, fontFamily: 'inherit', color: dark ? '#fff' : '#26231f', background: dark ? '#3a3632' : undefined, colorScheme: dark ? 'dark' : undefined, outline: 'none', flexShrink: 0 }} />
      {day && <button onClick={() => onChange(period, '')} title="Сбросить дату" style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>}
    </div>
  )
}
