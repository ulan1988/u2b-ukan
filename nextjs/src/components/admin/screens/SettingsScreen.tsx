'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { listUsers, createUser } from '@/lib/api/auth'
import { fetchRefs } from '@/lib/api/refs'

const ROLES = [
  { v: 'logist', l: 'Логист' }, { v: 'branch', l: 'Филиал' }, { v: 'client', l: 'Клиент' },
  { v: 'supplier_client', l: 'Поставщик-клиент' }, { v: 'warehouse_manager', l: 'Кладовщик' },
  { v: 'bookkeeper', l: 'Бухгалтер' }, { v: 'admin', l: 'Администратор' },
]
const roleLabel = (v: string) => ROLES.find(r => r.v === v)?.l || v
const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none', width: '100%' }

export default function SettingsScreen({ orgId }: { orgId: string }) {
  const [users, setUsers] = useState<any[]>([])
  const [orgs, setOrgs] = useState<{ id: string; name: string; kind?: string }[]>([])
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'logist', orgId })
  const [msg, setMsg] = useState('')

  const load = () => listUsers().then(setUsers)
  useEffect(() => {
    load()
    fetchRefs().then((r: any) => setOrgs(r.organizations || []))
  }, [])

  const orgName = (id: string) => orgs.find(o => o.id === id)?.name || '—'
  const reset = () => setF({ name: '', email: '', password: '', role: 'logist', orgId })

  async function create() {
    setMsg('')
    const r = await createUser(f)
    if (!r.ok) { setMsg('⚠ ' + (r.error || 'Ошибка')); return }
    setMsg('✅ Создан'); reset(); load()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>Настройки · Пользователи</div>

      <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 0 0 1.5px #e6e2dc', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 12 }}>НОВЫЙ ПОЛЬЗОВАТЕЛЬ</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
          <input style={inp} placeholder="Имя" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input style={inp} placeholder="Email (логин)" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <input style={inp} type="password" placeholder="Пароль (мин. 4)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          <select style={inp} value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
          <select style={{ ...inp, gridColumn: '1 / -1' }} value={f.orgId} onChange={e => setF({ ...f, orgId: e.target.value })} title="Организация / филиал">
            <option value="">— организация / филиал —</option>
            {orgs.map(o => <option key={o.id} value={o.id}>🏢 {o.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button disabled={!f.name.trim() || !f.email.trim() || f.password.length < 4 || !f.orgId} onClick={create}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: (!f.name.trim() || !f.email.trim() || f.password.length < 4 || !f.orgId) ? 0.5 : 1 }}>Создать</button>
          {msg && <span style={{ fontSize: 13, color: COLORS.textMuted }}>{msg}</span>}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>ПОЛЬЗОВАТЕЛИ ({users.length})</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Имя', 'Email', 'Роль', 'Организация', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 16px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid #f1efec' }}>
                <td style={{ padding: '8px 16px', fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: '8px 16px', color: COLORS.textMuted }}>{u.email}</td>
                <td style={{ padding: '8px 16px', color: COLORS.textMuted }}>{roleLabel(u.role)}</td>
                <td style={{ padding: '8px 16px', color: COLORS.textMuted }}>{orgName(u.orgId)}</td>
                <td style={{ padding: '8px 16px' }}>{u.active ? '🟢' : '⚪️'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
