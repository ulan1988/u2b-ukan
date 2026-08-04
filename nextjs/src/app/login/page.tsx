'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { login as apiLogin } from '@/lib/api/auth'

function LoginForm() {
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('+7')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || ''

  useEffect(() => {
    try {
      const p = localStorage.getItem('ukan_last_phone'); if (p) setPhone(p)
      const em = localStorage.getItem('ukan_last_email'); if (em) setEmail(em)
      const m = localStorage.getItem('ukan_last_mode'); if (m === 'phone' || m === 'email') setMode(m)
    } catch {}
  }, [])

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const r = await apiLogin({ email, password })
      if (!r.ok) { setError(r.error || 'Ошибка входа'); return }
      try { localStorage.setItem('ukan_last_email', email); localStorage.setItem('ukan_last_mode', 'email') } catch {}
      redirect(r.data.user)
    } catch { setError('Ошибка сети') }
    finally { setLoading(false) }
  }

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault()
    // Беспарольный вход по телефону намеренно не подключён (дыра безопасности v1).
    setError('Вход по телефону скоро — используйте email и пароль')
  }

  function redirect(user: any) {
    if (from) { router.push(from); return }
    const needsSlug = ['logist', 'warehouse_manager', 'branch', 'client', 'supplier_client'].includes(user.role)
    if (needsSlug && !user.slug) { router.push('/board'); return }
    if (user.role === 'logist') router.push(`/rsp/${user.slug}`)
    else if (user.role === 'warehouse_manager') router.push(`/warehouse/${user.slug}`)
    else if (user.role === 'branch') router.push(`/branch/${user.slug}`)
    else if (user.role === 'client' || user.role === 'supplier_client') router.push(`/client/${user.slug}`)
    else router.push('/admin')
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#26231f', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }

  return (
    <div style={{ minHeight: '100vh', background: '#f1efec', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 380, background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="U2B" style={{ width: 54, height: 54, borderRadius: 13, display: 'block' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 19, lineHeight: 1, color: '#211f1c' }}>U2B ERP</div>
            <div style={{ fontSize: 12, color: '#5f5952', fontWeight: 700, marginTop: 4, letterSpacing: '.04em' }}>автоматизация бизнеса</div>
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Вход в систему</div>
        <div style={{ color: '#5f5952', fontSize: 14, marginBottom: 20 }}>Выберите способ входа</div>
        <div style={{ display: 'flex', background: '#f1efec', borderRadius: 10, padding: 4, marginBottom: 20 }}>
          {[['email', '📧 Email + пароль'], ['phone', '📱 По телефону']].map(([m, l]) => (
            <button key={m} onClick={() => { setMode(m as any); setError('') }} style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#26231f' : '#5f5952', boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.1)' : 'none' }}>
              {l}
            </button>
          ))}
        </div>
        {error && <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>{error}</div>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer', fontSize: 14, color: '#4a4640', userSelect: 'none' }}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#d4613a', cursor: 'pointer' }} />
          Запомнить меня на этом устройстве
        </label>
        {mode === 'email' && (
          <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={lbl}>EMAIL</label><input style={inp} type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="Ваш email" required /></div>
            <div><label style={lbl}>ПАРОЛЬ</label><input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></div>
            <button type="submit" disabled={loading} style={{ marginTop: 8, padding: '12px', background: '#d4613a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              {loading ? 'Вход...' : 'ВОЙТИ →'}
            </button>
          </form>
        )}
        {mode === 'phone' && (
          <form onSubmit={handlePhone} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={lbl}>ТЕЛЕФОН</label>
              <input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 700 000 00 00" required />
              <div style={{ fontSize: 12, color: '#5f5952', marginTop: 4 }}>Для клиентов и логистов — телефон является паролем</div>
            </div>
            <button type="submit" disabled={loading} style={{ marginTop: 8, padding: '12px', background: '#d4613a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              {loading ? 'Вход...' : 'ВОЙТИ ПО ТЕЛЕФОНУ →'}
            </button>
          </form>
        )}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/register" style={{ color: '#5f5952', fontSize: 14 }}>Новый клиент? Зарегистрироваться →</a>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f1efec' }} />}>
      <LoginForm />
    </Suspense>
  )
}
