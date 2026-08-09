'use client'
// У-Канбан — универсальный дашборд всех карточек (зеркало программы). Колонки по стадиям,
// переключатель Продажа/Закуп/Всё, поиск по всему (номер, контрагент, товар, цена, коммент).
// Клик по карточке → полная карточка. (Кнопка «Вернуть» — Этап C.)
import { useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, isPurchase } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'

const COLS = [
  { key: 'incoming', label: '📥 Входящие', tint: '#eef4ff', test: (o: any) => o.screen === 'incoming' && !o.toacc },
  { key: 'reception', label: '🔄 Приёмка', tint: '#fff8e1', test: (o: any) => o.screen === 'reception' },
  { key: 'outgoing', label: '📤 Исходящие', tint: '#fff0ea', test: (o: any) => o.screen === 'outgoing' },
  { key: 'accounting', label: '📋 К учёту', tint: '#f3eeff', test: (o: any) => o.screen === 'incoming' && o.toacc },
  { key: 'bookkeeping', label: '📒 Бухгалтерия', tint: '#e8f5ee', test: (o: any) => o.screen === 'bookkeeping' },
  { key: 'archive', label: '🗂 Архив', tint: '#f1efec', test: (o: any) => o.screen === 'archive' },
]

const searchStr = (o: any) => {
  const pos = (o.positions || []).map((p: any) => `${p.name1c || ''} ${p.oral || ''} ${p.price ?? ''} ${p.qty ?? ''}`).join(' ')
  return `${o.id} ${o.fromName || ''} ${o.toName || ''} ${o.comment || ''} ${o.status || ''} ${pos}`.toLowerCase()
}
const cardTotal = (o: any) => (o.positions || []).reduce((s: number, p: any) => s + Number(p.qty || 0) * Number(p.price || 0), 0)

export default function UkanbanScreen({ orders, onOpen }: { orders: any[]; orgId: string; onAction?: (id: string, a: string) => void; onOpen?: (o: any) => void }) {
  const [kind, setKind] = useState<'all' | 'sale' | 'purchase'>('all')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    let base = orders.filter(o => !o.isCancelled && !o.isDraft)
    if (kind !== 'all') base = base.filter(o => (kind === 'purchase') === isPurchase(o))
    const s = q.trim().toLowerCase()
    if (s) base = base.filter(o => searchStr(o).includes(s))
    return base
  }, [orders, kind, q])

  const cols = COLS.map(c => ({ ...c, items: filtered.filter(c.test) }))
  const total = filtered.length

  const kindBtn = (k: 'all' | 'sale' | 'purchase', label: string) => (
    <button onClick={() => setKind(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: kind === k ? COLORS.primary : '#fff', color: kind === k ? '#fff' : COLORS.textMuted, boxShadow: kind === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>🗂 У-Канбан</div>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>карточек: <b style={{ color: COLORS.text }}>{total}</b></span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>{kindBtn('all', 'Всё')}{kindBtn('sale', '💰 Продажа')}{kindBtn('purchase', '🛒 Закуп')}</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск: товар, цена, коммент, номер, контрагент…"
          style={{ marginLeft: 'auto', minWidth: 300, flex: '1 1 300px', maxWidth: 460, padding: '9px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', fontSize: 14 }} />
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
        {cols.map(c => (
          <div key={c.key} style={{ flexShrink: 0, width: 300, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 180px)' }}>
            <div style={{ padding: '9px 12px', background: '#fff', borderRadius: '12px 12px 0 0', boxShadow: '0 0 0 1.5px #e6e2dc', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, zIndex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</span>
              <span style={{ marginLeft: 'auto', background: c.items.length ? COLORS.primary : '#e6e2dc', color: c.items.length ? '#fff' : '#837c72', fontSize: 12, padding: '1px 8px', borderRadius: 20, fontWeight: 700 }}>{c.items.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: c.tint, borderRadius: '0 0 12px 12px', padding: '8px 8px 4px', minHeight: 60 }}>
              {c.items.length === 0 ? <div style={{ color: '#9a938a', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>—</div>
                : c.items.map(o => {
                  const purchase = isPurchase(o)
                  const nPos = (o.positions || []).length
                  const first = (o.positions || [])[0]
                  return (
                    <div key={o.id} onClick={() => onOpen?.(o)} style={{ background: '#fff', borderRadius: 10, padding: 10, marginBottom: 8, cursor: 'pointer', borderLeft: `4px solid ${purchase ? '#7a3aaa' : '#2e8a5e'}`, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: purchase ? '#7a3aaa' : COLORS.primary }}>{o.id}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: purchase ? '#f3eeff' : '#e8f5ee', color: purchase ? '#7a3aaa' : '#2e8a5e' }}>{purchase ? 'ЗАКУП' : 'ПРОДАЖА'}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{o.fromName || '—'}</div>
                      {first && <div style={{ fontSize: 12, color: '#5f5952', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><RalDot code={extractRal(first.name1c || first.oral)} size={10} />{first.name1c || first.oral}{nPos > 1 ? ` +${nPos - 1}` : ''}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#837c72' }}>{o.status}</span>
                        {cardTotal(o) > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: COLORS.text }}>{fmtMoney(cardTotal(o))} ₸</span>}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
