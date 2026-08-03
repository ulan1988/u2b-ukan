'use client'
import { useState } from 'react'
import OrderCard, { type CardAction } from '@/components/admin/OrderCard'
import { isPurchase } from '@/lib/adminFmt'
import { COLORS } from '@/lib/colors'

type Tab = 'new' | 'changed' | 'toacc' | 'drafts' | 'cancelled'

export default function IncomingScreen({ orders, onAction, onOpen }: {
  orders: any[]; onAction: (id: string, a: string) => void; onOpen: (o: any) => void
}) {
  const [tab, setTab] = useState<Tab>('new')
  const inc = orders.filter(o => o.screen === 'incoming')

  const groups: Record<Tab, any[]> = {
    new: inc.filter(o => !o.isDraft && !o.isCancelled && !o.toacc && !o.isChanged),
    changed: inc.filter(o => o.isChanged && !o.isCancelled),
    toacc: inc.filter(o => o.toacc && !o.isCancelled),
    drafts: inc.filter(o => o.isDraft && isPurchase(o)),
    cancelled: inc.filter(o => o.isCancelled),
  }
  const TABS: { k: Tab; l: string }[] = [
    { k: 'new', l: 'Новые' }, { k: 'changed', l: 'Изменения' }, { k: 'toacc', l: 'К учёту' },
    { k: 'drafts', l: 'Черновики' }, { k: 'cancelled', l: 'Отменённые' },
  ]
  const actionsFor = (t: Tab): CardAction[] => {
    if (t === 'cancelled') return [{ action: 'restore', label: 'Восстановить' }]
    if (t === 'toacc') return [{ action: 'sendAcc', label: 'В учёт', variant: 'primary' }, { action: 'cancel', label: 'Отмена', variant: 'danger' }]
    return [{ action: 'accept', label: 'Принять', variant: 'primary' }, { action: 'cancel', label: 'Отмена', variant: 'danger' }]
  }

  const list = groups[tab]
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>Входящие</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const n = groups[t.k].length
          const active = tab === t.k
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, background: active ? COLORS.primary : '#fff', color: active ? '#fff' : COLORS.textMuted, boxShadow: active ? 'none' : '0 0 0 1.5px #e6e2dc' }}>
              {t.l}{n > 0 && ` · ${n}`}
            </button>
          )
        })}
      </div>
      {list.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted, fontSize: 14 }}>Нет карточек</div>
        : <div style={{ maxWidth: 640 }}>{list.map(o => <OrderCard key={o.id} order={o} actions={actionsFor(tab)} onAction={onAction} onOpen={onOpen} />)}</div>}
    </div>
  )
}
