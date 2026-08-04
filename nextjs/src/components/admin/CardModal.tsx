'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { getCard } from '@/lib/adminApi'
import { isPurchase, statusStyle, fmtMoney, cardSum } from '@/lib/adminFmt'

export default function CardModal({ id, onClose, onAction }: {
  id: string; onClose: () => void; onAction: (id: string, a: string) => void
}) {
  const [card, setCard] = useState<any>(null)
  const [tab, setTab] = useState<'positions' | 'history'>('positions')

  useEffect(() => { getCard(id).then(setCard) }, [id])

  const o = card?.order
  const positions = card?.positions || []
  const history = card?.history || []

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
      <div className="anim-pop" onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        {!card ? <div style={{ padding: 48, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : (
          <>
            {/* Шапка */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>{o.id}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isPurchase(o) ? '#f3eeff' : '#e8f5ee', color: isPurchase(o) ? '#7a3aaa' : '#2e8a5e' }}>{isPurchase(o) ? '🛒 ЗАКУП' : 'ПРОДАЖА'}</span>
              <span style={statusStyle(o.status)}>{o.status}</span>
              <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>

            {/* Мета */}
            <div style={{ padding: '12px 20px', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: COLORS.textMuted, borderBottom: '1px solid #f6f3f0' }}>
              <div><b style={{ color: COLORS.text }}>{o.fromName || '—'}</b> · {isPurchase(o) ? 'закуп' : 'клиент'}</div>
              {o.phone && <div>📞 {o.phone}</div>}
              {o.comment && <div>💬 {o.comment}</div>}
              <div style={{ marginLeft: 'auto', fontWeight: 700, color: COLORS.text }}>{fmtMoney(cardSum(o))} ₸</div>
            </div>

            {/* Табы */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 20px 0' }}>
              {([['positions', `Позиции · ${positions.length}`], ['history', `История · ${history.length}`]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? '#f1efec' : 'transparent', color: tab === k ? COLORS.text : COLORS.textMuted }}>{l}</button>
              ))}
            </div>

            <div style={{ padding: 20, background: '#faf8f6', maxHeight: 380, overflowY: 'auto' }}>
              {tab === 'positions' ? (
                positions.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Позиций нет</div> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ color: COLORS.textMuted, fontSize: 11 }}>{['Наименование', 'Кол-во', 'Цена', 'Сумма', 'Статус'].map(h => <th key={h} style={{ textAlign: 'left', padding: '4px 8px' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {positions.map((p: any) => (
                        <tr key={p.id} style={{ borderTop: '1px solid #efece8' }}>
                          <td style={{ padding: '7px 8px' }}>{p.name1c || p.oral || '—'}</td>
                          <td style={{ padding: '7px 8px' }}>{Number(p.qty)} {p.unit}</td>
                          <td style={{ padding: '7px 8px' }}>{fmtMoney(Number(p.price))}</td>
                          <td style={{ padding: '7px 8px', fontWeight: 600 }}>{fmtMoney(Number(p.qty) * Number(p.price))}</td>
                          <td style={{ padding: '7px 8px' }}><span style={statusStyle(p.status)}>{p.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                history.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14 }}>История пуста</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {history.map((h: any) => (
                      <div key={h.id} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.primary, marginTop: 6, flexShrink: 0 }} />
                        <div>
                          <div style={{ color: COLORS.text }}>{h.detail || h.action}</div>
                          <div style={{ color: COLORS.textLight, fontSize: 11 }}>{h.userName} · {new Date(h.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Действия */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1efec', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {!o.isCancelled
                ? <button onClick={() => { onAction(o.id, 'cancel'); onClose() }} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'transparent', color: '#b03020', boxShadow: '0 0 0 1.5px #e6dcd6', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}>Отменить заявку</button>
                : <button onClick={() => { onAction(o.id, 'restore'); onClose() }} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#fff', color: COLORS.text, boxShadow: '0 0 0 1.5px #d8d3cc', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}>Восстановить</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
