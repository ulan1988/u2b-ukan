'use client'
import OrderCard, { type CardAction } from '@/components/admin/OrderCard'
import { COLORS } from '@/lib/colors'

// Универсальный экран-список для простых стадий (К учёту / Бухгалтерия / Архив).
export default function ListScreen({ title, screen, orders, actions, onAction, empty = 'Нет карточек' }: {
  title: string; screen: string; orders: any[]; actions: CardAction[]
  onAction: (id: string, a: string) => void; empty?: string
}) {
  const list = orders.filter(o => o.screen === screen)
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>{title}</div>
      {list.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted, fontSize: 14 }}>{empty}</div>
        : <div style={{ maxWidth: 640 }}>{list.map(o => <OrderCard key={o.id} order={o} actions={o.isCancelled ? [] : actions} onAction={onAction} />)}</div>}
    </div>
  )
}
