'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'

export default function HistoryScreen({ orgId, onOpen }: { orgId: string; onOpen?: (o: any) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/history?orgId=${orgId}`).then(r => r.json()).then(h => setRows(Array.isArray(h) ? h : [])).catch(() => {}).finally(() => setLoading(false))
  }, [orgId])

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>История</div>
      {loading ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>
        : rows.length === 0 ? <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14 }}>Журнал пуст</div>
          : (
            <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
              {rows.map(h => (
                <div key={h.id} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f6f3f0', fontSize: 13 }}>
                  <span onClick={() => onOpen?.({ id: h.cardId })} style={{ fontWeight: 700, color: COLORS.primary, cursor: onOpen ? 'pointer' : 'default', flexShrink: 0, width: 130 }}>{h.cardId}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: COLORS.text }}>{h.detail || h.action}</div>
                    <div style={{ color: COLORS.textLight, fontSize: 11 }}>{h.userName} · {new Date(h.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
