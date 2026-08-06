'use client'
import { useState } from 'react'
import { COLORS } from '@/lib/colors'
import { isPurchase, cardProgress, cardSum, barColor, statusStyle, sourceStyle, sourceLabel, fmtMoney, fmtDate } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'

// Вкладка «К учёту» (toacc) вынесена в отдельный экран /admin/accounting (по решению
// владельца — единый экран учёта без дубля). Остальное — 1:1 с Улканом.
type Tab = 'new' | 'changed' | 'drafts' | 'cancelled'

function KindBadge({ o }: { o: any }) {
  const p = isPurchase(o)
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: p ? '#f3eeff' : '#e8f5ee', color: p ? '#7a3aaa' : '#2e8a5e' }}>{p ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
}
function Btn({ onClick, children, variant }: { onClick: () => void; children: React.ReactNode; variant?: 'primary' | 'danger' }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 12,
      background: variant === 'primary' ? COLORS.primary : variant === 'danger' ? 'transparent' : COLORS.white, color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#b03020' : COLORS.text,
      boxShadow: variant === 'danger' ? '0 0 0 1.5px #e6dcd6' : variant === 'primary' ? 'none' : '0 0 0 1.5px #d8d3cc' }}>{children}</button>
  )
}

export default function IncomingScreen({ orders, onAction, onOpen }: {
  orders: any[]; onAction: (id: string, a: string) => void; onOpen: (o: any) => void
}) {
  const [tab, setTab] = useState<Tab>('new')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState('')
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2000) }
  const toggle = (id: string) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const inc = orders.filter(o => o.screen === 'incoming')
  const groups: Record<Tab, any[]> = {
    new: inc.filter(o => !o.isDraft && !o.isCancelled && !o.toacc),
    changed: inc.filter(o => o.isChanged && !o.isCancelled),
    drafts: inc.filter(o => o.isDraft && !isPurchase(o)),   // черновики продаж (закуп-черновики — в приёмке)
    cancelled: inc.filter(o => o.isCancelled),
  }
  const TABS: { k: Tab; l: string }[] = [
    { k: 'new', l: 'Новые' }, { k: 'changed', l: 'Изменения' },
    { k: 'drafts', l: 'Черновики' }, { k: 'cancelled', l: 'Отменённые' },
  ]
  const list = groups[tab]

  const renderCard = (o: any) => {
    const pct = cardProgress(o)
    const purchase = isPurchase(o)
    const ps = o.positions || []
    return (
      <div key={o.id} style={{ background: purchase ? '#faf7fd' : '#fff', borderRadius: 12, padding: '16px 18px', marginBottom: 10, borderLeft: `4px solid ${purchase ? '#7a3aaa' : '#2e8a5e'}`, boxShadow: `0 0 0 1.5px ${purchase ? '#e3d4f0' : '#e6e2dc'}` }}>
        {/* Строка 1: мета */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: COLORS.primary }}>{o.id}</span>
          <KindBadge o={o} />
          <span style={statusStyle(o.status)}>{o.status}</span>
          {o.source && <span style={sourceStyle(o.source)}>{sourceLabel(o.source)}</span>}
          {o.isChanged && <span style={{ fontSize: 12, background: '#fff0ea', color: '#c0532a', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>⚡ ИЗМЕНЕНО</span>}
          {o.postponed && <span style={{ fontSize: 12, background: '#eef2ff', color: '#4a5aaa', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>ОТЛОЖЕН</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952' }}>{fmtDate(o.createdAt)}</span>
          <button onClick={() => { navigator.clipboard.writeText(o.trackingLink); toast('Ссылка скопирована!') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>📎</button>
          <Btn onClick={() => onOpen(o)}>Открыть</Btn>
        </div>
        {/* Строка 2: маршрут */}
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{o.fromName} {o.toName ? `→ ${o.toName}` : ''}</div>
        {/* Строка 3: превью комментария */}
        {o.comment && <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 8, lineHeight: 1.5 }}>{o.comment.slice(0, 100)}{o.comment.length > 100 ? '...' : ''}</div>}
        {/* Блок изменения */}
        {o.isChanged && (
          <div style={{ background: '#fff8e1', borderRadius: 8, padding: '8px 12px', marginBottom: 10, border: '1.5px solid #f5e4a0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#8a6f00', marginBottom: 2 }}>Изменение от клиента:</div>
            <div style={{ fontSize: 14 }}>{o.changeText}</div>
            {o.changePhone && <div style={{ fontSize: 13, color: '#5f5952', marginTop: 2 }}>📞 {o.changePhone}</div>}
          </div>
        )}
        {/* Прогресс + шторка позиций */}
        {ps.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ height: 5, background: '#f1efec', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 4 }} />
            </div>
            <button onClick={() => toggle(o.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: expanded.has(o.id) ? '#fff0ea' : '#f6f3f0', border: `1.5px solid ${expanded.has(o.id) ? COLORS.primary : '#e6e2dc'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', padding: '7px 12px', fontSize: 13, color: expanded.has(o.id) ? COLORS.primaryDark : '#3a3631', fontWeight: 700, width: '100%' }}>
              <span style={{ display: 'inline-block', transition: 'transform .15s', transform: expanded.has(o.id) ? 'rotate(90deg)' : 'none' }}>▸</span>
              {expanded.has(o.id) ? 'Скрыть позиции' : `Показать позиции (${ps.length})`}
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#5f5952' }}>{fmtMoney(cardSum(o))}</span>
            </button>
            {expanded.has(o.id) && (
              <div style={{ marginTop: 6, border: '1px solid #f1efec', borderRadius: 8, overflow: 'hidden' }}>
                {ps.map((p: any, pi: number) => (
                  <div key={p.id || pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 13, background: pi % 2 ? '#faf9f7' : '#fff', borderTop: pi ? '1px solid #f1efec' : 'none' }}>
                    <span style={{ flex: 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <RalDot code={extractRal(p.name1c || p.oral || '')} size={12} />
                      {p.oral || p.name1c || '—'}
                    </span>
                    <span style={{ color: '#5f5952', whiteSpace: 'nowrap' }}>{Number(p.qty)} {p.unit}</span>
                    <span style={{ whiteSpace: 'nowrap', color: Number(p.price) > 0 ? '#211f1c' : '#c0a', minWidth: 66, textAlign: 'right' }}>{Number(p.price) > 0 ? fmtMoney(Number(p.price)) : 'нет цены'}</span>
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 700, minWidth: 74, textAlign: 'right' }}>{fmtMoney(Number(p.price || 0) * Number(p.qty || 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Кнопки по вкладке */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1efec', flexWrap: 'wrap' }}>
          {tab === 'new' && <>
            <Btn onClick={() => onAction(o.id, 'postpone')}>{o.postponed ? 'Снять откл.' : 'Отложить'}</Btn>
            <Btn variant="danger" onClick={() => onAction(o.id, 'cancel')}>Отменить</Btn>
            <Btn variant="primary" onClick={() => onAction(o.id, 'accept')}>ПРИНЯТЬ →</Btn>
          </>}
          {tab === 'changed' && <>
            <Btn variant="danger" onClick={() => onAction(o.id, 'confirmChg')}>Отклонить</Btn>
            <Btn variant="primary" onClick={() => onAction(o.id, 'confirmChg')}>✓ Принять изменение</Btn>
          </>}
          {tab === 'drafts' && <>
            <Btn onClick={() => onOpen(o)}>Доработать</Btn>
            <Btn variant="primary" onClick={() => onAction(o.id, 'accept')}>Отправить</Btn>
          </>}
          {tab === 'cancelled' && <>
            {o.cancelReason && <span style={{ fontSize: 13, color: '#5f5952' }}>Причина: {o.cancelReason}</span>}
            <Btn onClick={() => onAction(o.id, 'restore')}>↺ Восстановить</Btn>
          </>}
        </div>
      </div>
    )
  }

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>Входящие</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const n = groups[t.k].length
          const active = tab === t.k
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: active ? COLORS.primary : '#fff', color: active ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
              {t.l} ({n})
            </button>
          )
        })}
      </div>
      {list.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952', fontSize: 14 }}>Нет карточек</div>
        : tab === 'new'
          // Вкладка «Новые» — авто-канбан по заказчику
          ? (() => {
              const gs: Record<string, any[]> = {}
              for (const o of list) { const key = ((o.toName || o.fromName || '—').trim()) || '—'; (gs[key] = gs[key] || []).push(o) }
              const cols = Object.entries(gs).sort((a, b) => b[1].length - a[1].length)
              return (
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
                  {cols.map(([client, items]) => (
                    <div key={client} style={{ flexShrink: 0, width: 350, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 240px)' }}>
                      <div style={{ padding: '9px 12px', background: COLORS.sidebar.bg, borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, letterSpacing: '.05em' }}>ЗАКАЗЧИК</div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client}</div>
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
            })()
          : <div style={{ maxWidth: 680 }}>{list.map(renderCard)}</div>}
    </div>
  )
}
