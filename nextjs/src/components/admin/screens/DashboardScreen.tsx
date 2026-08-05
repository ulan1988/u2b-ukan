'use client'
import { COLORS } from '@/lib/colors'
import { cardSum, isOverdue, fmtMoney } from '@/lib/adminFmt'

// Счёт по стадиям = как показывают экраны (toacc-карточки идут в «К учёту», не во «Входящие»).
const STAGES: { l: string; match: (o: any) => boolean }[] = [
  { l: 'Входящие', match: o => o.screen === 'incoming' && !o.toacc },
  { l: 'Приёмка', match: o => o.screen === 'reception' },
  { l: 'Исходящие', match: o => o.screen === 'outgoing' },
  { l: 'К учёту', match: o => (o.screen === 'incoming' && o.toacc) || o.screen === 'accounting' },
  { l: 'Бухгалтерия', match: o => o.screen === 'bookkeeping' },
  { l: 'Архив', match: o => o.screen === 'archive' },
]

export default function DashboardScreen({ orders }: { orders: any[] }) {
  const live = orders.filter(o => !o.isCancelled)
  const toAccount = live.filter(o => (o.screen === 'incoming' && o.toacc) || o.screen === 'accounting').length
  const kpi = [
    { l: 'Активных', v: live.filter(o => !o.isDraft && o.screen !== 'archive').length, bg: '#fff0ea', color: '#c0532a' },
    { l: 'В работе', v: live.filter(o => o.screen === 'outgoing').length, bg: '#fdf8e1', color: '#8a6f00' },
    { l: 'К учёту', v: toAccount, bg: '#e8f5ee', color: '#2e8a5e' },
    { l: 'Просрочено', v: orders.filter(isOverdue).length, bg: '#faeaea', color: '#b03020' },
  ]
  const flow = STAGES.map(s => ({ l: s.l, n: live.filter(s.match).length }))
  const maxFlow = Math.max(1, ...flow.map(f => f.n))

  const byClient: Record<string, number> = {}
  for (const o of live) if (o.kind === 'sale') byClient[o.fromName || '—'] = (byClient[o.fromName || '—'] || 0) + cardSum(o)
  const top = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>Дашборд</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpi.map(k => (
          <div key={k.l} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.v}</div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>{k.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 12 }}>ПОТОК ПО СТАДИЯМ</div>
          {flow.map(f => (
            <div key={f.l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 90, fontSize: 13, color: COLORS.text }}>{f.l}</div>
              <div style={{ flex: 1, height: 10, background: '#f1efec', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(f.n / maxFlow) * 100}%`, background: COLORS.primary, borderRadius: 5 }} />
              </div>
              <div style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{f.n}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 12 }}>ТОП КЛИЕНТОВ (по сумме продаж)</div>
          {top.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Нет данных</div>
            : top.map(([name, sum]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f6f3f0', fontSize: 14 }}>
                <span>{name}</span><span style={{ fontWeight: 700 }}>{fmtMoney(sum)} ₸</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
