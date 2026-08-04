'use client'
import { COLORS } from '@/lib/colors'

// Авто-канбан: карточки авто-группируются в колонки (по заказчику и т.п.).
// Тёмная шапка колонки + счётчик, горизонтальный скролл — стиль Улкана.
export default function KanbanColumns({ cards, groupBy, label = 'ЗАКАЗЧИК', renderCard }: {
  cards: any[]; groupBy: (o: any) => string; label?: string; renderCard: (o: any) => React.ReactNode
}) {
  const groups: Record<string, any[]> = {}
  for (const o of cards) { const k = (groupBy(o) || '—').trim() || '—'; (groups[k] = groups[k] || []).push(o) }
  const cols = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)

  if (cols.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted, fontSize: 14 }}>Нет карточек</div>

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, alignItems: 'flex-start' }}>
      {cols.map(([name, items]) => (
        <div key={name} style={{ flexShrink: 0, width: 340, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 250px)' }}>
          <div style={{ padding: '9px 12px', background: COLORS.sidebar.bg, borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            </div>
            <span style={{ background: COLORS.primary, color: '#fff', fontSize: 12, padding: '1px 8px', borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>{items.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', background: '#f4f2ef', borderRadius: '0 0 12px 12px', padding: '10px 8px' }}>
            {items.map(renderCard)}
          </div>
        </div>
      ))}
    </div>
  )
}
