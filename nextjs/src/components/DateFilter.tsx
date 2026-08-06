'use client'
// Фильтр по дате просмотра — портирован из Улкана 1:1.
import type { CSSProperties } from 'react'

const PRIMARY = '#d4613a'
export type Period = 'all' | 'today' | 'week' | 'month'

export function inPeriod(date: string | Date | null | undefined, period: Period, day: string): boolean {
  if (day) {
    if (!date) return false
    const d = new Date(date), t = new Date(day)
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
  }
  if (period === 'all') return true
  if (!date) return false
  const d = new Date(date), now = new Date()
  if (period === 'today') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const ms = now.getTime() - d.getTime()
  if (period === 'week') return ms <= 7 * 864e5 && ms >= -864e5
  if (period === 'month') return ms <= 30 * 864e5 && ms >= -864e5
  return true
}

export default function DateFilter({ period, day, onChange }: { period: Period; day: string; onChange: (period: Period, day: string) => void }) {
  const chipStyle = (on: boolean): CSSProperties => ({ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: on ? PRIMARY : '#f1efec', color: on ? '#fff' : '#6b655b' })
  const opts: [Period, string][] = [['all', 'Всё'], ['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']]
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600, marginRight: 2 }}>📅</span>
      {opts.map(([p, label]) => <button key={p} onClick={() => onChange(p, '')} style={chipStyle(!day && period === p)}>{label}</button>)}
      <input type="date" value={day} onChange={e => onChange(period, e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${day ? PRIMARY : '#e6e2dc'}`, fontSize: 12.5, fontFamily: 'inherit', color: '#26231f', outline: 'none' }} />
      {day && <button onClick={() => onChange(period, '')} title="Сбросить дату" style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>}
    </div>
  )
}
