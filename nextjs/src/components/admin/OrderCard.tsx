'use client'
import { COLORS } from '@/lib/colors'
import { isPurchase, cardSum, cardProgress, barColor, statusStyle, fmtMoney, fmtDate } from '@/lib/adminFmt'

export interface CardAction { action: string; label: string; variant?: 'primary' | 'default' | 'danger' }

function KindBadge({ o }: { o: any }) {
  const p = isPurchase(o)
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: p ? '#f3eeff' : '#e8f5ee', color: p ? '#7a3aaa' : '#2e8a5e' }}>{p ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
}

export default function OrderCard({ order, actions = [], onAction, onOpen }: {
  order: any; actions?: CardAction[]; onAction: (id: string, action: string) => void; onOpen?: (o: any) => void
}) {
  const pct = cardProgress(order)
  const sum = cardSum(order)
  const ps = order.positions || []
  const btnStyle = (v?: string): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, borderRadius: 7, padding: '6px 12px', fontSize: 12,
    background: v === 'primary' ? COLORS.primary : v === 'danger' ? 'transparent' : COLORS.white,
    color: v === 'primary' ? '#fff' : v === 'danger' ? '#b03020' : COLORS.text,
    boxShadow: v === 'danger' ? '0 0 0 1.5px #e6dcd6' : v === 'primary' ? 'none' : '0 0 0 1.5px #d8d3cc',
  })

  return (
    <div className="anim-fade" style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,.05)', border: '1px solid #efece8', opacity: order.isCancelled ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span onClick={() => onOpen?.(order)} style={{ fontWeight: 700, fontSize: 14, cursor: onOpen ? 'pointer' : 'default' }}>{order.id}</span>
        <KindBadge o={order} />
        <span style={{ marginLeft: 'auto', ...statusStyle(order.status) }}>{order.status}</span>
      </div>
      <div style={{ fontSize: 14, color: COLORS.text, marginBottom: 2 }}>{order.fromName || '—'}</div>
      {order.comment && <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>{order.comment}</div>}

      <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 6 }}>
        {ps.length} поз.{ps.length ? ` · ${ps.slice(0, 2).map((p: any) => p.name1c || p.oral).filter(Boolean).join(', ')}${ps.length > 2 ? '…' : ''}` : ''}
      </div>

      <div style={{ height: 5, background: '#f1efec', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), transition: 'width .3s', borderRadius: 4 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>{fmtDate(order.createdAt)}</span>
        {sum > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{fmtMoney(sum)} ₸</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {actions.map(a => (
            <button key={a.action} onClick={() => onAction(order.id, a.action)} style={btnStyle(a.variant)}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
