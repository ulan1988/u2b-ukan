'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { COLORS } from '@/lib/colors'
import { statusStyle } from '@/lib/adminFmt'

const STAGES = [
  { k: 'incoming', l: 'Принята' }, { k: 'reception', l: 'Приёмка' }, { k: 'outgoing', l: 'Доставка' },
  { k: 'accounting', l: 'Учёт' }, { k: 'archive', l: 'Завершена' },
]
const stageIndex = (screen: string) => {
  const i = STAGES.findIndex(s => s.k === screen)
  if (screen === 'bookkeeping') return 3
  return i < 0 ? 0 : i
}

function Track() {
  const sp = useSearchParams()
  const [id, setId] = useState(sp.get('id') || '')
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function lookup(q: string) {
    if (!q.trim()) return
    setLoading(true); setErr(''); setData(null)
    const res = await fetch(`/api/track?id=${encodeURIComponent(q.trim())}`)
    const d = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setErr(d.error || 'Не найдено'); return }
    setData(d)
  }
  useEffect(() => { if (sp.get('id')) lookup(sp.get('id')!) }, [])

  const curStage = data ? stageIndex(data.screen) : 0

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="U2B" style={{ width: 44, height: 44, borderRadius: 11 }} />
          <div style={{ fontWeight: 800, fontSize: 20 }}>Отслеживание заявки</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input value={id} onChange={e => setId(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookup(id)} placeholder="Номер заявки (ПР-0001-…)" style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 15, outline: 'none' }} />
          <button onClick={() => lookup(id)} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Найти</button>
        </div>

        {loading && <div style={{ textAlign: 'center', color: COLORS.textMuted, padding: 20 }}>Поиск…</div>}
        {err && <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 10, padding: '12px 16px', fontSize: 14 }}>{err}</div>}

        {data && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>{data.id}</span>
              <span style={statusStyle(data.status)}>{data.status}</span>
            </div>

            {data.isCancelled ? (
              <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 10, padding: '12px 16px', fontSize: 14 }}>Заявка отменена{data.cancelReason ? `: ${data.cancelReason}` : ''}</div>
            ) : (
              <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
                {STAGES.map((s, i) => (
                  <div key={s.k} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: 6, borderRadius: 4, background: i <= curStage ? COLORS.primary : '#e9e5e0', marginBottom: 6 }} />
                    <div style={{ fontSize: 10, color: i <= curStage ? COLORS.text : COLORS.textLight, fontWeight: i === curStage ? 700 : 400 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>ПОЗИЦИИ</div>
            {data.positions.map((p: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f6f3f0' }}>
                <span style={{ fontSize: 14 }}>{p.name} · {p.qty} {p.unit}</span>
                <span style={statusStyle(p.status)}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TrackPage() {
  return <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f1efec' }} />}><Track /></Suspense>
}
