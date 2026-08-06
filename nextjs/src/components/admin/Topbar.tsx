'use client'
import { useEffect, useState } from 'react'
import { isOverdue } from '@/lib/adminFmt'
import { COLORS } from '@/lib/colors'
import { listNotifications, markRead } from '@/lib/api/notifications'

const INP: React.CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#26231f' }

function Bell() {
  const [items, setItems] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const load = () => listNotifications().then(setItems)
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [])
  const unread = items.filter(n => !n.read).length
  async function read(n: any) { if (!n.read) { await markRead(n.id); load() } }
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ padding: '7px 10px', background: '#fff', border: '1.5px solid #e6e2dc', borderRadius: 8, cursor: 'pointer', fontSize: 16, position: 'relative' }}>
        🔔{unread > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 8, height: 8, borderRadius: '50%', background: COLORS.primary }} />}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 40, right: 0, background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,.12)', width: 320, maxHeight: 400, overflowY: 'auto', zIndex: 500, border: '1.5px solid #e6e2dc' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1efec', fontWeight: 700, fontSize: 14 }}>Уведомления</div>
          {items.length === 0 ? <div style={{ padding: 16, color: '#5f5952', fontSize: 14 }}>Нет уведомлений</div>
            : items.map(n => (
              <div key={n.id} onClick={() => read(n)} style={{ padding: '10px 16px', borderBottom: '1px solid #f6f3f0', cursor: 'pointer', background: n.read ? '#fff' : '#fff8f5', fontSize: 13 }}>
                <div style={{ color: '#26231f' }}>{n.text}</div>
                <div style={{ color: '#837c72', fontSize: 11, marginTop: 2 }}>{new Date(n.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

export default function Topbar({ title, orders, search, onSearch, onBurger, orgs = [], orgId, onOrg }: {
  title: string; orders: any[]; search: string; onSearch: (v: string) => void; onBurger: () => void
  orgs?: { id: string; name: string; kind?: string }[]; orgId?: string; onOrg?: (id: string) => void
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
        {orgs.length > 1 && onOrg && (
          <select value={orgId} onChange={e => onOrg(e.target.value)} title="Организация / филиал"
            style={{ ...INP, width: 'auto', fontWeight: 700, cursor: 'pointer' }}>
            {orgs.map(o => <option key={o.id} value={o.id}>🏢 {o.name}</option>)}
          </select>
        )}
        <input style={{ ...INP, width: 200 }} value={search} onChange={e => onSearch(e.target.value)} placeholder="🔍 Поиск..." />
        <Bell />
      </div>
    </div>
  )
}
