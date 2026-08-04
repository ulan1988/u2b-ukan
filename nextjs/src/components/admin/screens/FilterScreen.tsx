'use client'
import { useState } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import { COLORS } from '@/lib/colors'

const SCREENS = [
  { k: '', l: 'Все стадии' }, { k: 'incoming', l: 'Входящие' }, { k: 'reception', l: 'Приёмка' },
  { k: 'outgoing', l: 'Исходящие' }, { k: 'accounting', l: 'К учёту' }, { k: 'bookkeeping', l: 'Бухгалтерия' }, { k: 'archive', l: 'Архив' },
]
const sel: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none' }

export default function FilterScreen({ orders, onAction, onOpen }: {
  orders: any[]; onAction: (id: string, a: string) => void; onOpen?: (o: any) => void
}) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [screen, setScreen] = useState('')

  const list = orders.filter(o => {
    if (kind && o.kind !== kind) return false
    if (screen && o.screen !== screen) return false
    if (q.trim() && !`${o.id} ${o.fromName} ${o.comment}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>Фильтр</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Номер / клиент / коммент" style={{ ...sel, flex: 1, minWidth: 200 }} />
        <select value={kind} onChange={e => setKind(e.target.value)} style={sel}><option value="">Все типы</option><option value="sale">Продажа</option><option value="purchase">Закуп</option></select>
        <select value={screen} onChange={e => setScreen(e.target.value)} style={sel}>{SCREENS.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}</select>
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 10 }}>Найдено: {list.length}</div>
      {list.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14, padding: 20 }}>Ничего не найдено</div>
        : list.map(o => <OrderCard key={o.id} order={o} actions={[]} onAction={onAction} onOpen={onOpen} />)}
    </div>
  )
}
