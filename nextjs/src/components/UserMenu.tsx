'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { me as fetchMe, logout as apiLogout } from '@/lib/api/auth'

interface Me { id: string; name: string; role: string; orgId: string }

const ROLE: Record<string, string> = { admin: 'Администратор', bookkeeper: 'Бухгалтер', manager: 'Менеджер', logist: 'Логист' }

export default function UserMenu() {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    fetchMe().then((r: any) => setMe(r?.user || null))
  }, [])

  async function logout() {
    await apiLogout()
    location.href = '/login'
  }

  if (!me) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      {me.role === 'admin' && (
        <Link href="/users" className="px-3 py-1.5 rounded-lg font-semibold text-neutral-600 hover:bg-neutral-100">👥 Пользователи</Link>
      )}
      <span className="text-neutral-500 hidden sm:inline" title={ROLE[me.role] || me.role}>{me.name}</span>
      <button onClick={logout} className="px-3 py-1.5 rounded-lg font-semibold text-red-600 hover:bg-red-50" title="Выйти">Выйти</button>
    </div>
  )
}
