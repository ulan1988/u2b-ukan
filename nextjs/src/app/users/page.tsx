'use client'
import { useEffect, useState } from 'react'
import { fetchRefs } from '@/lib/api/refs'
import { listUsers, createUser } from '@/lib/api/auth'

const inp = 'border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500'
const ROLES = [
  { value: 'admin', label: 'Администратор' }, { value: 'bookkeeper', label: 'Бухгалтер' },
  { value: 'manager', label: 'Менеджер' }, { value: 'logist', label: 'Логист' },
]
const roleLabel = (v: string) => ROLES.find(r => r.value === v)?.label || v

export default function UsersPage() {
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'manager', orgId: '' })

  async function load() {
    const [refs, list] = await Promise.all([fetchRefs(), listUsers()])
    const os = (refs as any).organizations || []
    setOrgs(os)
    setUsers(Array.isArray(list) ? list : [])
    setF(v => ({ ...v, orgId: v.orgId || os[0]?.id || '' }))
  }
  useEffect(() => { load() }, [])

  const orgName = (id: string) => orgs.find(o => o.id === id)?.name || '—'

  async function add() {
    setMsg('')
    const r = await createUser(f)
    if (!r.ok) { setMsg(r.error || 'Ошибка'); return }
    setMsg('✅ Пользователь создан')
    setF({ name: '', email: '', password: '', role: 'manager', orgId: orgs[0]?.id || '' })
    await load()
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">👥 Пользователи</h1>
      {msg && <div className="mb-3 text-sm">{msg}</div>}

      <div className="bg-white rounded-2xl ring-1 ring-neutral-200 p-5 mb-5">
        <div className="text-xs font-bold text-neutral-500 mb-3">НОВЫЙ ПОЛЬЗОВАТЕЛЬ</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input className={inp} placeholder="Имя" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input className={inp} placeholder="Email (логин)" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <input className={inp} type="password" placeholder="Пароль (мин. 4)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          <select className={inp} value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select className={`${inp} col-span-2`} value={f.orgId} onChange={e => setF({ ...f, orgId: e.target.value })}>
            <option value="">— организация —</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2 disabled:opacity-50"
          disabled={!f.name.trim() || !f.email.trim() || f.password.length < 4 || !f.orgId}
          onClick={add}>Создать</button>
      </div>

      <div className="text-xs font-bold text-neutral-500 mb-2">ПОЛЬЗОВАТЕЛИ ({users.length})</div>
      <div className="bg-white rounded-2xl ring-1 ring-neutral-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">
            {['Имя', 'Email', 'Роль', 'Организация', 'Статус'].map(h => <th key={h} className="text-left px-4 py-2">{h}</th>)}
          </tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-medium">{u.name}</td>
                <td className="px-4 py-2 text-neutral-500">{u.email}</td>
                <td className="px-4 py-2 text-neutral-500">{roleLabel(u.role)}</td>
                <td className="px-4 py-2 text-neutral-500">{orgName(u.orgId)}</td>
                <td className="px-4 py-2">{u.active ? '🟢' : '⚪️'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
