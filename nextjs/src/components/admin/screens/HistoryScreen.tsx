'use client'
// Журнал действий — портирован из Улкана 1:1 (фильтры пользователь/даты + пресеты).
import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { listHistory } from '@/lib/api/orders'
import { listUsers } from '@/lib/api/auth'

interface HistRow { id: string; cardId: string; action: string; detail: string; userName: string; createdAt: string }
const INP: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const fmtDateTime = (s: string) => { try { const d = new Date(s); return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) } catch { return s } }
const todayStr = () => new Date().toISOString().slice(0, 10)
const shiftStr = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10) }

export default function HistoryScreen({ orgId, onOpen }: { orgId: string; onOpen?: (o: any) => void }) {
  const [rows, setRows] = useState<HistRow[]>([])
  const [users, setUsers] = useState<{ name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setRows(await listHistory(orgId, { user: user || undefined, from: from || undefined, to: to || undefined }) as any)
    setLoading(false)
  }, [orgId, user, from, to])
  useEffect(() => { load() }, [load])
  useEffect(() => { listUsers().then((u: any) => setUsers(u)) }, [])

  const names = Array.from(new Set([...users.map(u => u.name), ...rows.map(r => r.userName)].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'))
  const preset = (label: string, f: string, t: string) => <button onClick={() => { setFrom(f); setTo(t) }} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: (from === f && to === t) ? COLORS.primary : '#f1efec', color: (from === f && to === t) ? '#fff' : '#6b655b' }}>{label}</button>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>🕓 История действий</div>
        <span style={{ fontSize: 14, color: '#5f5952' }}>{rows.length} записей</span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
        <select style={{ ...INP, minWidth: 200 }} value={user} onChange={e => setUser(e.target.value)}><option value="">👤 Все пользователи</option>{names.map(n => <option key={n} value={n}>{n}</option>)}</select>
        <span style={{ fontSize: 13, color: '#5f5952' }}>с</span><input type="date" style={INP} value={from} onChange={e => setFrom(e.target.value)} />
        <span style={{ fontSize: 13, color: '#5f5952' }}>по</span><input type="date" style={INP} value={to} onChange={e => setTo(e.target.value)} />
        {preset('Сегодня', todayStr(), todayStr())}{preset('Неделя', shiftStr(7), todayStr())}{preset('Месяц', shiftStr(30), todayStr())}
        {(user || from || to) && <button onClick={() => { setUser(''); setFrom(''); setTo('') }} style={{ ...INP, cursor: 'pointer', color: '#c1121c', fontWeight: 600 }}>Сбросить</button>}
        <button onClick={load} style={{ ...INP, cursor: 'pointer' }}>⟳</button>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8f6f3' }}>{['ВРЕМЯ', 'ПОЛЬЗОВАТЕЛЬ', 'ДЕЙСТВИЕ', 'КАРТОЧКА', 'ДЕТАЛИ'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
        </table>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? <div style={{ padding: 30, textAlign: 'center', color: '#5f5952' }}>Загрузка...</div>
            : rows.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: '#5f5952' }}>Нет записей по выбранным фильтрам</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1efec' }}>
                <td style={{ padding: '9px 14px', fontSize: 13, color: '#5f5952', whiteSpace: 'nowrap' }}>{fmtDateTime(r.createdAt)}</td>
                <td style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.userName || '—'}</td>
                <td style={{ padding: '9px 14px', fontSize: 12.5 }}>{r.action}</td>
                <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: COLORS.primary, cursor: onOpen ? 'pointer' : 'default' }} onClick={() => onOpen?.({ id: r.cardId })}>{r.cardId}</td>
                <td style={{ padding: '9px 14px', fontSize: 13, color: '#5f5952' }}>{r.detail || ''}</td>
              </tr>
            ))}</tbody></table>}
        </div>
      </div>
    </div>
  )
}
