'use client'
import { COLORS } from '@/lib/colors'
import { isPurchase, cardSum, cardProgress, barColor, statusStyle, sourceStyle, sourceLabel, isOverdue, fmtMoney, fmtCreated } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'

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
  const purchase = isPurchase(order)
  const btnStyle = (v?: string): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, borderRadius: 7, padding: '6px 12px', fontSize: 12,
    background: v === 'primary' ? COLORS.primary : v === 'danger' ? 'transparent' : COLORS.white,
    color: v === 'primary' ? '#fff' : v === 'danger' ? '#b03020' : COLORS.text,
    boxShadow: v === 'danger' ? '0 0 0 1.5px #e6dcd6' : v === 'primary' ? 'none' : '0 0 0 1.5px #d8d3cc',
  })

  return (
    <div className="anim-fade" style={{ background: order.isChanged ? '#fffceb' : (order.cold ? 'rgba(250,248,246,.6)' : (purchase ? '#faf7fd' : '#fff')), borderRadius: 12, padding: '14px 16px', marginBottom: 10, borderLeft: `4px solid ${order.isChanged ? '#e4b73a' : (purchase ? '#7a3aaa' : '#2e8a5e')}`, boxShadow: `0 0 0 1.5px ${order.isChanged ? '#e4b73a' : (purchase ? '#e3d4f0' : '#e6e2dc')}`, opacity: order.isCancelled ? 0.55 : (order.cold ? 0.6 : 1) }}>
      {/* Шапка: id + бейджи + дата */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span onClick={() => onOpen?.(order)} style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: COLORS.primary, cursor: onOpen ? 'pointer' : 'default' }}>{order.id}</span>
        {order.cold && <span>❄️</span>}
        <KindBadge o={order} />
        <span style={statusStyle(order.status)}>{order.status}</span>
        {order.source && <span style={sourceStyle(order.source)}>{sourceLabel(order.source)}</span>}
        {order.isChanged && <span style={{ fontSize: 11, background: '#fdf3d8', color: '#8a6f00', padding: '2px 8px', borderRadius: 20, fontWeight: 800 }}>⚠ ИЗМЕНЕНИЕ · проверьте</span>}
        {isOverdue(order) && <span style={{ fontSize: 12, background: '#faeaea', color: '#b03020', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>ПРОСРОЧ.</span>}
        {order.postponed && <span style={{ fontSize: 12, background: '#eef2ff', color: '#4a5aaa', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>ОТЛОЖЕН</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952', whiteSpace: 'nowrap' }}>🕒 {fmtCreated(order.createdAt)}</span>
      </div>

      {/* Клиент крупно + число позиций + сумма */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: ps.length > 0 ? 8 : 0, cursor: onOpen ? 'pointer' : 'default' }} onClick={() => onOpen?.(order)}>
        <span style={{ fontWeight: 700, fontSize: 16, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.fromName || '—'}</span>
        {order.toName && <span style={{ fontSize: 13, color: '#5f5952', whiteSpace: 'nowrap' }}>→ {order.toName}</span>}
        {ps.length > 0 && <span style={{ fontSize: 13, color: '#5f5952', whiteSpace: 'nowrap' }}>{ps.length} поз.</span>}
        {sum > 0 && <b style={{ marginLeft: 'auto', fontSize: 16, whiteSpace: 'nowrap' }}>{fmtMoney(sum)} ₸</b>}
      </div>

      {ps.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 5, background: '#f1efec', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), transition: 'width .3s', borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: barColor(pct) }}>{pct}%</span>
        </div>
      )}
      {order.comment && ps.length === 0 && <div style={{ fontSize: 13, color: '#5f5952', marginTop: 4 }}>{order.comment.slice(0, 80)}{order.comment.length > 80 ? '...' : ''}</div>}

      {/* Превью позиций с RAL-точкой */}
      {ps.length > 0 && (
        <div style={{ fontSize: 12, color: '#5f5952', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {ps.slice(0, 3).map((p: any) => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <RalDot code={extractRal(p.name1c || p.oral || '')} size={12} />
              {p.name1c || p.oral}
            </span>
          ))}
          {ps.length > 3 && <span>…</span>}
        </div>
      )}

      {/* Кнопки действий (для экранов-списков) */}
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {actions.map(a => (
            <button key={a.action} onClick={() => onAction(order.id, a.action)} style={btnStyle(a.variant)}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
