'use client'
import { useCallback, useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import { useLiveData } from '@/lib/live'
import { profit } from '@/lib/api/finance'
import { chainReport } from '@/lib/api/procurement'

const PURPLE = '#7a3aaa'
const cth: React.CSSProperties = { padding: '7px 10px', fontSize: 12, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }
const ctd: React.CSSProperties = { padding: '8px 10px', fontSize: 13, verticalAlign: 'top', borderTop: '1px solid #f1efec' }

// Закуп-отчёт = Рентабельность (наша ERP) + цепочка закуп→продажа (Ф4, позже).
export default function ProcurementScreen({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<'profit' | 'chain'>('profit')
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (tab === 'profit' && !data) profit(orgId).then(setData)
  }, [tab, data, orgId])

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>Закуп-отчёт</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([['profit', 'Рентабельность'], ['chain', 'Цепочка закуп→продажа']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : COLORS.textMuted, boxShadow: tab === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
      </div>

      {tab === 'chain' ? <ChainReport orgId={orgId} />
        : !data ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>
          : <ProfitReport data={data} />}
    </div>
  )
}

function ChainReport({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await chainReport(orgId) as any[]) } catch { setRows([]) } finally { setLoading(false) }
  }, [orgId])
  useLiveData(load, [orgId])

  return (
    <div className="anim-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#5f5952' }}>
          Цепочка: <b style={{ color: PURPLE }}>Закуп</b> (поставщик · товар · сколько) → <b>Склад</b> (транзит) → <b style={{ color: '#2e8a5e' }}>Продажа</b> (заказчик · кол-во · коммент).
        </div>
        <button onClick={load} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>⟳ Обновить</button>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка…</div>
        : rows.length === 0
          ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952', fontSize: 14 }}>Закупов пока нет. Соберите закуп в Приёмке (Автозакуп).</div>
          : rows.map(c => (
            <div key={c.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 16, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
              {/* Шапка закупа */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#faf7fd', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: PURPLE }}>{c.id}</span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: c.status === 'Доставлено' ? '#e8f5ee' : '#f3eeff', color: c.status === 'Доставлено' ? '#2e8a5e' : PURPLE }}>{c.isDraft ? 'черновик' : c.status}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#837c72' }}>{new Date(c.createdAt).toLocaleDateString('ru-RU')}</span>
              </div>
              {/* Таблица с группами колонок */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th colSpan={3} style={{ ...cth, background: '#f3eeff', color: PURPLE, textAlign: 'center', borderRight: '2px solid #e6e2dc' }}>ЗАКУП</th>
                      <th style={{ ...cth, background: '#eef2ff', color: '#4a5aaa', textAlign: 'center', borderRight: '2px solid #e6e2dc' }}>СКЛАД</th>
                      <th colSpan={3} style={{ ...cth, background: '#e8f5ee', color: '#2e8a5e', textAlign: 'center' }}>ПРОДАЖА</th>
                    </tr>
                    <tr style={{ background: '#faf9f7' }}>
                      <th style={cth}>Поставщик</th>
                      <th style={cth}>Наименование</th>
                      <th style={{ ...cth, textAlign: 'right' }}>Куплено</th>
                      <th style={{ ...cth, textAlign: 'center', borderLeft: '2px solid #e6e2dc', borderRight: '2px solid #e6e2dc' }}>На складе</th>
                      <th style={cth}>Заказчик</th>
                      <th style={{ ...cth, textAlign: 'right' }}>Кол-во</th>
                      <th style={cth}>Коммент</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.positions.flatMap((p: any, pi: number) => {
                      const distributed = p.breakdown.reduce((s: number, b: any) => s + (b.qty || 0), 0)
                      const remain = p.qty - distributed
                      const bd: any[] = p.breakdown.length ? p.breakdown : [null]
                      return bd.map((b: any, bi: number) => (
                        <tr key={`${pi}-${bi}`}>
                          {bi === 0 && (
                            <>
                              <td style={{ ...ctd, borderTop: pi ? '2px solid #ece7e0' : ctd.borderTop }} rowSpan={bd.length}>
                                <span style={{ fontSize: 12, background: '#f3eeff', color: PURPLE, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{p.supplier}</span>
                              </td>
                              <td style={{ ...ctd, borderTop: pi ? '2px solid #ece7e0' : ctd.borderTop, fontWeight: 600 }} rowSpan={bd.length}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RalDot code={extractRal(p.name)} size={12} />{p.name}</span>
                              </td>
                              <td style={{ ...ctd, borderTop: pi ? '2px solid #ece7e0' : ctd.borderTop, textAlign: 'right', fontWeight: 800, color: PURPLE, whiteSpace: 'nowrap' }} rowSpan={bd.length}>{p.qty} {p.unit}</td>
                              <td style={{ ...ctd, borderTop: pi ? '2px solid #ece7e0' : ctd.borderTop, textAlign: 'center', borderLeft: '2px solid #e6e2dc', borderRight: '2px solid #e6e2dc', whiteSpace: 'nowrap' }} rowSpan={bd.length}>
                                <div style={{ fontSize: 12, color: '#4a5aaa', fontWeight: 600 }}>Центр-Склад</div>
                                {remain !== 0 && <div style={{ fontSize: 11, color: remain > 0 ? '#8a6f00' : '#b03020', marginTop: 2 }}>{remain > 0 ? `остаток ${remain}` : `перебор ${-remain}`}</div>}
                              </td>
                            </>
                          )}
                          {b ? (
                            <>
                              <td style={ctd}>{b.client}</td>
                              <td style={{ ...ctd, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{b.qty} {p.unit}</td>
                              <td style={{ ...ctd, color: '#5f5952', maxWidth: 240 }}>{b.comment ? (b.comment.length > 80 ? b.comment.slice(0, 80) + '…' : b.comment) : '—'}</td>
                            </>
                          ) : (
                            <td style={{ ...ctd, color: '#837c72' }} colSpan={3}>Раскладка по заказчикам не зафиксирована</td>
                          )}
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
    </div>
  )
}

function ProfitReport({ data }: { data: any }) {
  const t = data.totals || { revenue: 0, cost: 0, profit: 0, margin: 0 }
  const sales = data.sales || []
  const kpi = [
    { l: 'Выручка', v: t.revenue, color: COLORS.text },
    { l: 'Себестоимость', v: t.cost, color: '#b03020' },
    { l: 'Прибыль', v: t.profit, color: '#2e8a5e' },
  ]
  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpi.map(k => (
          <div key={k.l} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{fmtMoney(k.v)} ₸</div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>{k.l}</div>
          </div>
        ))}
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.primary }}>{t.margin.toFixed(1)}%</div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>Маржа</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>ПО ПРОДАЖАМ</div>
        {sales.length === 0 ? <div style={{ padding: 20, color: COLORS.textMuted, fontSize: 14 }}>Нет продаж</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Документ', 'Клиент', 'Выручка', 'Себест.', 'Прибыль', 'Маржа'].map((h, i) => <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '8px 16px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {sales.map((s: any) => (
                  <tr key={s.id} style={{ borderTop: '1px solid #f1efec' }}>
                    <td style={{ padding: '8px 16px', fontWeight: 600 }}>{s.number}</td>
                    <td style={{ padding: '8px 16px' }}>{s.client}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtMoney(s.revenue)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: '#b03020' }}>{fmtMoney(s.cost)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: '#2e8a5e', fontWeight: 600 }}>{fmtMoney(s.profit)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>{s.margin.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
