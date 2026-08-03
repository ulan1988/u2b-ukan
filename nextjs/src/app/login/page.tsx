'use client'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || 'Ошибка входа'); return }
      location.href = '/finance'
    } catch { setErr('Сеть недоступна') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl p-8 shadow-sm">
        <div className="text-2xl font-bold mb-1">U2B</div>
        <div className="text-neutral-500 text-sm mb-6">Вход в систему учёта</div>

        <label className="block text-sm font-semibold text-neutral-600 mb-1">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} autoFocus
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 mb-4 outline-none focus:border-neutral-900" />

        <label className="block text-sm font-semibold text-neutral-600 mb-1">Пароль</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 mb-4 outline-none focus:border-neutral-900" />

        {err && <div className="text-red-600 text-sm mb-4">{err}</div>}

        <button disabled={busy}
          className="w-full bg-neutral-900 text-white rounded-lg py-2.5 font-semibold hover:bg-neutral-800 disabled:opacity-50">
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
