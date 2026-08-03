'use client'
import { isOverdue } from '@/lib/adminFmt'

const INP: React.CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#26231f' }

export default function Topbar({ title, orders, search, onSearch, onBurger }: {
  title: string; orders: any[]; search: string; onSearch: (v: string) => void; onBurger: () => void
}) {
  const active = orders.filter(o => !o.isDraft && !o.isCancelled && o.screen !== 'archive').length
  const working = orders.filter(o => o.screen === 'outgoing' && !o.isCancelled).length
  const overdue = orders.filter(isOverdue).length
  const toAcc = orders.filter(o => o.screen === 'accounting' && !o.isCancelled).length
  const pills = [
    { label: `Активных: ${active}`, bg: '#fff0ea', color: '#c0532a' },
    { label: `В работе: ${working}`, bg: '#fdf8e1', color: '#8a6f00' },
    { label: `Просрочено: ${overdue}`, bg: '#faeaea', color: '#b03020' },
    { label: `К учёту: ${toAcc}`, bg: '#e8f5ee', color: '#2e8a5e' },
  ]

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #e6e2dc', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <button onClick={onBurger} className="hamburger" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: '2px 6px', color: '#26231f', display: 'none', flexShrink: 0 }}>☰</button>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#5f5952' }}>{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginLeft: 20, flexWrap: 'wrap' }}>
        {pills.map(({ label, bg, color }) => (
          <span key={label} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: bg, color, fontWeight: 600 }}>{label}</span>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input style={{ ...INP, width: 220 }} value={search} onChange={e => onSearch(e.target.value)} placeholder="🔍 Поиск..." />
      </div>
    </div>
  )
}
