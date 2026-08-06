'use client'
import { useState } from 'react'
import { COLORS } from '@/lib/colors'
import { cardSum, cardProgress, posPct, barColor, fmtMoney, fmtDate, isOverdue } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import { setPosStatus } from '@/lib/adminApi'

const POS_STATUSES = ['В работе', 'Готово к отгрузке', 'В пути', 'Доставлено', 'Принято филиалом']

function ProgressBar({ pct, height = 5 }: { pct: number; height?: number }) {
  return (
    <div style={{ height, background: '#f1efec', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), transition: 'width .3s', borderRadius: 4 }} />
    </div>
  )
}

function Btn({ onClick, children, variant, disabled }: { onClick: () => void; children: React.ReactNode; variant?: 'primary'; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 12,
        background: variant === 'primary' ? (disabled ? '#e9e5e0' : COLORS.primary) : COLORS.white, color: variant === 'primary' ? (disabled ? '#a89f95' : '#fff') : COLORS.text,
        boxShadow: variant === 'primary' ? 'none' : '0 0 0 1.5px #d8d3cc' }}>{children}</button>
  )
}

function OutgoingCard({ order, onAction, onReload, onOpen, toast }: {
  order: any; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void; toast: (m: string) => void
}) {
  const pct = cardProgress(order)
  const overdue = isOverdue(order)
  const ps = order.positions || []
  async function setPos(posId: string, status: string) { await setPosStatus(order.id, status, posId); onReload() }

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', marginBottom: 12 }}>
      {/* Шапка */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1efec' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span onClick={() => onOpen?.(order)} style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14, color: COLORS.primary, cursor: onOpen ? 'pointer' : 'default' }}>{order.id}</span>
          {overdue && <span style={{ fontSize: 12, background: '#faeaea', color: '#b03020', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⚠ Просрочено</span>}
          {pct >= 100 && <span style={{ fontSize: 12, background: '#e8f5ee', color: '#2e8a5e', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>✓ Готово</span>}
          {pct < 100 && !overdue && <span style={{ fontSize: 12, background: '#fff0ea', color: '#c0532a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>В работе</span>}
          {order.isChanged && <span style={{ fontSize: 12, background: '#fdf8e1', color: '#8a6f00', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⚡ Изменено клиентом</span>}
          <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 16, color: barColor(pct) }}>{pct}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{order.fromName} → {order.toName || '—'}</span>
          {order.deadline && <span style={{ fontSize: 13, color: '#5f5952' }}>срок {fmtDate(order.deadline)}</span>}
        </div>
        <div style={{ marginTop: 8 }}><ProgressBar pct={pct} height={6} /></div>
      </div>

      {/* Позиции */}
      {ps.length > 0 && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1efec' }}>
          {ps.map((pos: any, i: number) => (
            <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: i < ps.length - 1 ? '1px solid #f8f6f3' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><RalDot code={extractRal(pos.name1c || pos.oral || '')} size={13} />{pos.name1c || pos.oral}</div>
                <div style={{ fontSize: 12, color: '#5f5952' }}>{Number(pos.qty)} {pos.unit}{pos.resp ? ` · ${pos.resp}` : ''}{pos.supplier ? ` · ${pos.supplier}` : ''}</div>
              </div>
              <div style={{ width: 120 }}><ProgressBar pct={posPct(pos)} height={4} /></div>
              {pos.late && <span style={{ fontSize: 12, background: '#faeaea', color: '#b03020', padding: '1px 6px', borderRadius: 20, fontWeight: 600, flexShrink: 0 }}>ПРОСРОЧ.</span>}
              <select value={pos.status} onChange={e => setPos(pos.id, e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                {POS_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Футер */}
      <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {cardSum(order) > 0 && <span style={{ fontSize: 14, fontWeight: 600, color: '#26231f' }}>Сумма: {fmtMoney(cardSum(order))}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {onOpen && <Btn onClick={() => onOpen(order)}>Открыть</Btn>}
          <Btn onClick={() => { navigator.clipboard.writeText(order.trackingLink); toast('Ссылка скопирована!') }}>📎 Ссылка клиенту</Btn>
          <Btn onClick={() => onAction(order.id, 'returnOut')}>← Вернуть</Btn>
          <Btn onClick={() => onAction(order.id, 'returnToReception')}>← На стол приёмки</Btn>
          <Btn variant="primary" onClick={() => onAction(order.id, 'markAll')}>✓ Всё выполнено</Btn>
          {order.toacc && <Btn variant="primary" onClick={() => onAction(order.id, 'sendAcc')}>Отправить в К Учёту →</Btn>}
        </div>
      </div>
    </div>
  )
}

export default function OutgoingScreen({ orders, onAction, onReload, onOpen }: { orders: any[]; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void }) {
  const [tab, setTab] = useState<'inwork' | 'ready' | 'all'>('all')
  const [flash, setFlash] = useState('')
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2000) }
  const outgoing = orders.filter(o => o.screen === 'outgoing' && !o.isCancelled)
  const inwork = outgoing.filter(o => cardProgress(o) < 60)
  const ready = outgoing.filter(o => cardProgress(o) >= 60)
  const tabs: Array<[typeof tab, string, any[]]> = [
    ['inwork', `В работе (${inwork.length})`, inwork],
    ['ready', `Готово к доставке (${ready.length})`, ready],
    ['all', `Все (${outgoing.length})`, outgoing],
  ]
  const list = tabs.find(t => t[0] === tab)?.[2] || outgoing

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>
        Исходящие <span style={{ fontSize: 14, color: '#5f5952', fontWeight: 400 }}>({outgoing.length})</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: tab === key ? COLORS.primary : '#fff', color: tab === key ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952', fontSize: 14 }}>Нет карточек</div>
        : <div>{list.map(o => <OutgoingCard key={o.id} order={o} onAction={onAction} onReload={onReload} onOpen={onOpen} toast={toast} />)}</div>}
    </div>
  )
}
