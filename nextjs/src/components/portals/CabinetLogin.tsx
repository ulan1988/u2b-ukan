'use client'
// Вход в отдельный кабинет листов (логин/пароль). Тёмная тема под кабинет.
import { useState } from 'react'
import { login } from '@/lib/api/auth'

const SANS = "Barlow, 'Golos Text', system-ui, sans-serif"

export default function CabinetLogin() {
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function go() {
    if (!email.trim() || !pass) { setErr('Введите логин и пароль'); return }
    setBusy(true); setErr('')
    const r: any = await login({ email: email.trim(), password: pass })
    setBusy(false)
    if (r.ok) location.reload()
    else setErr(r.error || 'Неверный логин или пароль')
  }
  const inp: React.CSSProperties = { width: '100%', padding: '15px 18px', borderRadius: 14, border: '2px solid #4a4f4b', background: '#2a2e2b', color: '#fff', fontSize: 17, fontWeight: 600, outline: 'none', marginBottom: 12, fontFamily: SANS, boxSizing: 'border-box' }
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(#171a19,#111312 260px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: SANS }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#1b1e1c', borderRadius: 20, padding: '30px 24px', boxShadow: '0 10px 50px rgba(0,0,0,.6)', border: '1px solid #2a2e2b' }}>
        <div style={{ fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: '#e25303', fontWeight: 700, marginBottom: 4 }}>📄 Кабинет</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#eceae5', marginBottom: 4 }}>Склад листов</div>
        <div style={{ fontSize: 13, color: '#8b8d88', marginBottom: 22 }}>Вход по логину и паролю</div>
        <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="логин" autoFocus style={inp} />
        <input value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="пароль" type="password" style={inp} />
        {err && <div style={{ color: '#e2705a', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button onClick={go} disabled={busy} style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', background: '#e25303', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: SANS, opacity: busy ? .6 : 1 }}>{busy ? '...' : 'Войти →'}</button>
      </div>
    </div>
  )
}
