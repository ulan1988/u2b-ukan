'use client'
import { COLORS } from '@/lib/colors'
import { cardSum, cardProgress, barColor, fmtMoney, isPurchase } from '@/lib/adminFmt'
import { setPosStatus } from '@/lib/adminApi'

const POS_STEPS = ['В работе', 'В пути', 'Доставлено']
const POS_STYLE: Record<string, { bg: string; color: string }> = {
  'В работе': { bg: '#fff0ea', color: '#c0532a' },
  'В пути': { bg: '#fdf8e1', color: '#8a6f00' },
  'Доставлено': { bg: '#e8f5ee', color: '#2e8a5e' },
}

function Stepper({ status, onSet }: { status: string; onSet: (s: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {POS_STEPS.map(s => {
        const active = s === status
        const st = POS_STYLE[s]
        return (
          <button key={s} onClick={() => onSet(s)}
            style={{ padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: active ? st.bg : '#f4f1ed', color: active ? st.color : '#9a938a', boxShadow: active ? `inset 0 0 0 1.5px ${st.color}33` : 'none' }}>
            {s}
          </button>
        )
      })}
    </div>
  )
}

function OutgoingCard({ order, onAction, onReload, onOpen }: { order: any; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void }) {
  const pct = cardProgress(order)
  const sum = cardSum(order)
  const ps = order.positions || []
  async function setPos(posId: string | undefined, status: string) { await setPosStatus(order.id, status, posId); onReload() }

  return (
    <div className="anim-fade" style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.05)', border: '1px solid #efece8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span onClick={() => onOpen?.(order)} style={{ fontWeight: 700, fontSize: 14, cursor: onOpen ? 'pointer' : 'default' }}>{order.id}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: isPurchase(order) ? '#f3eeff' : '#e8f5ee', color: isPurchase(order) ? '#7a3aaa' : '#2e8a5e' }}>{isPurchase(order) ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: COLORS.textMuted }}>{order.fromName}</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        {ps.map((p: any) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f6f3f0' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name1c || p.oral || '—'}</div>
              <div style={{ fontSize: 11, color: COLORS.textLight }}>{Number(p.qty)} {p.unit}</div>
            </div>
            <Stepper status={p.status} onSet={s => setPos(p.id, s)} />
          </div>
        ))}
      </div>

      <div style={{ height: 5, background: '#f1efec', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), transition: 'width .3s' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {sum > 0 && <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(sum)} ₸</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setPos(undefined, 'Доставлено')} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: COLORS.white, color: COLORS.text, boxShadow: '0 0 0 1.5px #d8d3cc', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 12 }}>Все доставлены</button>
          <button disabled={!order.toacc} onClick={() => onAction(order.id, 'sendAcc')}
            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: order.toacc ? COLORS.primary : '#e9e5e0', color: order.toacc ? '#fff' : '#a89f95', cursor: order.toacc ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 700, fontSize: 12 }}>В учёт →</button>
        </div>
      </div>
    </div>
  )
}

export default function OutgoingScreen({ orders, onAction, onReload, onOpen }: { orders: any[]; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void }) {
  const list = orders.filter(o => o.screen === 'outgoing' && !o.isCancelled)
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>Исходящие</div>
      {list.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted, fontSize: 14 }}>Нет карточек в работе</div>
        : <div style={{ maxWidth: 680 }}>{list.map(o => <OutgoingCard key={o.id} order={o} onAction={onAction} onReload={onReload} onOpen={onOpen} />)}</div>}
    </div>
  )
}
