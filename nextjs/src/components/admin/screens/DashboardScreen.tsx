'use client'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/lib/colors'
import { barColor, fmtMoney } from '@/lib/adminFmt'
import { fetchDashboard } from '@/lib/api/reports'
import { sheetsAll, sheetsByOrgApi } from '@/lib/api/refs'
import { RalDot } from '@/lib/ral'
import { useLiveData } from '@/lib/live'

const fmtDateTime = (d: any) => d ? new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

function ProgressBar({ pct, height = 5 }: { pct: number; height?: number }) {
  return (
    <div style={{ height, background: '#f1efec', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), transition: 'width .3s', borderRadius: 4 }} />
    </div>
  )
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#26231f', fontFamily: 'inherit' }}>{children}</button>
}

type DashboardData = {
  kpi: { active: number; inwork: number; overdue: number; deliveredToday: number; turnoverToday: number }
  flow: { incoming: number; reception: number; outgoing: number; accounting: number; bookkeeping: number; archive: number }
  attention: { label: string; sub: string; tag: string; hue: string; screen: string }[]
  activity: { action: string; userName: string; createdAt: string }[]
  topClients: { name: string; count: number; pct: number }[]
  specProjects: { id: string; name: string; pct: number; cardCount: number }[]
}

export default function DashboardScreen({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [sheets, setSheets] = useState<any[]>([])
  const [sheetsOrg, setSheetsOrg] = useState<any[]>([])
  const setScreen = (s: string) => router.push(`/admin/${s}`)

  const load = useCallback(async () => {
    try { setDashboard(await fetchDashboard(orgId) as DashboardData) } catch {}
    try { setSheets(await sheetsAll()) } catch {}
    try { setSheetsOrg(await sheetsByOrgApi()) } catch {}
  }, [orgId])
  useLiveData(load, [orgId])

  return (
    <div className="anim-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Дашборд</div>
        <Btn onClick={load}>⟳ Обновить</Btn>
      </div>
      {!dashboard ? <div style={{ color: '#5f5952' }}>Загрузка...</div> : (
        <>
          {/* KPI плитки */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Активных', val: dashboard.kpi.active, color: COLORS.primary },
              { label: 'В работе', val: dashboard.kpi.inwork, color: '#c4a832' },
              { label: 'Просрочено', val: dashboard.kpi.overdue, color: '#b03020' },
              { label: 'Доставл. сегодня', val: dashboard.kpi.deliveredToday, color: '#2e8a5e' },
              { label: 'Оборот сегодня', val: fmtMoney(dashboard.kpi.turnoverToday), color: '#4a5aaa' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
                <div style={{ fontSize: 12, color: '#5f5952', fontWeight: 600, marginBottom: 4 }}>{label.toUpperCase()}</div>
                <div style={{ fontWeight: 700, fontSize: 22, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Поток + Активность */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Поток</div>
              {[
                { label: 'Входящие', val: dashboard.flow.incoming, screen: 'incoming' },
                { label: 'Приёмка', val: dashboard.flow.reception, screen: 'reception' },
                { label: 'Исходящие', val: dashboard.flow.outgoing, screen: 'outgoing' },
                { label: 'К учёту', val: dashboard.flow.accounting, screen: 'accounting' },
                { label: 'Бухгалтерия', val: dashboard.flow.bookkeeping, screen: 'bookkeeping' },
                { label: 'Архив', val: dashboard.flow.archive, screen: 'archive' },
              ].map(({ label, val, screen: s }) => (
                <div key={label} onClick={() => setScreen(s)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', cursor: 'pointer', borderBottom: '1px solid #f1efec' }}>
                  <span style={{ fontSize: 14 }}>{label}</span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: val > 0 ? COLORS.primary : '#5f5952' }}>{val}</span>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Последние события</div>
              {dashboard.activity.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14 }}>Нет данных</div>
                : dashboard.activity.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < dashboard.activity.length - 1 ? '1px solid #f1efec' : 'none', alignItems: 'flex-start' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: i === 0 ? COLORS.primary : '#d8d3cc', marginTop: 7, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13 }}>{h.action}</div>
                      <div style={{ fontSize: 12, color: '#5f5952' }}>{h.userName} · {fmtDateTime(h.createdAt)}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Внимание + Клиенты + СпецПроекты */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>⚡ Внимание</div>
              {dashboard.attention.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14 }}>Всё в порядке</div>
                : dashboard.attention.map((a, i) => (
                  <div key={i} onClick={() => setScreen(a.screen)} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 8, cursor: 'pointer', background: '#faf8f6', border: `1.5px solid ${a.hue}22` }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: a.hue }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: '#5f5952' }}>{a.sub}</div>
                  </div>
                ))
              }
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Топ клиенты</div>
              {dashboard.topClients.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14 }}>Нет данных</div>
                : dashboard.topClients.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1efec' }}>
                    <span style={{ fontSize: 14 }}>{c.name}</span>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{c.count}</span>
                      <span style={{ fontSize: 12, color: '#5f5952', marginLeft: 6 }}>{c.pct}%</span>
                    </div>
                  </div>
                ))}
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>СпецПроекты</div>
              {dashboard.specProjects.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14 }}>Нет активных</div>
                : dashboard.specProjects.map((sp, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{sp.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: barColor(sp.pct) }}>{sp.pct}%</span>
                    </div>
                    <ProgressBar pct={sp.pct} />
                    <div style={{ fontSize: 12, color: '#5f5952', marginTop: 3 }}>{sp.cardCount} карточек</div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Целые листы (передатчик мастера) */}
          {(() => {
            const withGlyan = sheets.filter((s: any) => Number(s.glyan) > 0).sort((a: any, b: any) => Number(b.glyan) - Number(a.glyan))
            const totalG = sheets.reduce((a: number, s: any) => a + Number(s.glyan || 0), 0)
            return (
              <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc', marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>📄 Целые листы на складах</div>
                  <span style={{ fontSize: 13, color: '#5f5952' }}>всего {totalG} листов (глянец)</span>
                </div>
                {sheetsOrg.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {sheetsOrg.map((o: any) => (
                      <span key={o.orgId} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, background: '#f3eeff', color: '#26231f', borderRadius: 20, padding: '5px 12px', fontSize: 13 }}>
                        🏭 {o.orgName}: <b style={{ fontSize: 15 }}>{Number(o.glyan)}</b> лист{Number(o.mat) > 0 ? <span style={{ color: '#837c72' }}> · мат {Number(o.mat)}</span> : null}
                      </span>
                    ))}
                  </div>
                )}
                {withGlyan.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14 }}>Нет данных — мастер ещё не отметил листы (кабинет → 📄 Листы).</div>
                  : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                      {withGlyan.map((s: any) => (
                        <div key={s.color} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#faf8f6', boxShadow: '0 0 0 1px #eee' }}>
                          <RalDot code={s.color} size={16} />
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#26231f', lineHeight: 1 }}>{Number(s.glyan)}</div>
                            <div style={{ fontSize: 11, color: '#5f5952', fontWeight: 600 }}>{s.color}{Number(s.mat) > 0 ? ` · мат ${Number(s.mat)}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
