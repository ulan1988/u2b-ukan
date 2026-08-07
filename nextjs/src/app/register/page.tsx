'use client'
import { useState } from 'react'

export default function RegisterPage() {
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '' })
  const [err, setErr] = useState('')
  const [done, setDone] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Ошибка'); return }
      setDone(d)
    } catch { setErr('Сеть недоступна') } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#26231f', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }

  return (
    <div style={{ minHeight: '100vh', background: '#f1efec', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 380, background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Регистрация клиента</div>
        {done ? (
          <div>
            <div style={{ background: '#e8f5ee', color: '#2e8a5e', borderRadius: 8, padding: '12px 14px', fontSize: 14, marginBottom: 16 }}>✅ Аккаунт создан! Ваш кабинет: <a href={done.clientUrl} style={{ color: '#2e8a5e', fontWeight: 700 }}>{done.clientUrl}</a></div>
            <a href="/login" style={{ color: '#d4613a', fontSize: 14 }}>Войти →</a>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={lbl}>ИМЯ / КОМПАНИЯ</label><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
            <div><label style={lbl}>ЛОГИН</label><input style={inp} type="text" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></div>
            <div><label style={lbl}>ТЕЛЕФОН</label><input style={inp} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+7 700 000 00 00" /></div>
            <div><label style={lbl}>ПАРОЛЬ</label><input style={inp} type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></div>
            {err && <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>{err}</div>}
            <button type="submit" disabled={busy} style={{ marginTop: 4, padding: '12px', background: '#d4613a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? '…' : 'Зарегистрироваться'}</button>
            <a href="/login" style={{ textAlign: 'center', color: '#5f5952', fontSize: 14 }}>Уже есть аккаунт? Войти</a>
          </form>
        )}
      </div>
    </div>
  )
}
