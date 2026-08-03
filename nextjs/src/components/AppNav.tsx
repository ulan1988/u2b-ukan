'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import OrgSwitcher from '@/components/OrgSwitcher'
import UserMenu from '@/components/UserMenu'

// Экраны Улкана рисуют собственный интерфейс (сайдбар/порталы) — там верхняя
// ERP-навигация не нужна. Прячем её на них.
const HIDE_PREFIXES = ['/login', '/register', '/admin', '/rsp', '/branch', '/client', '/warehouse', '/track']

const LINKS = [
  { href: '/board', l: '🗂 Заявки' },
  { href: '/catalog', l: '📚 Справочники' },
  { href: '/documents', l: '📥 Приход' },
  { href: '/sales', l: '📤 Расход' },
  { href: '/returns', l: '↩️ Возвраты' },
  { href: '/production', l: '🏭 Производство' },
  { href: '/payments', l: '💵 Оплаты' },
  { href: '/finance', l: '💰 Финансы' },
  { href: '/profit', l: '📈 Рентабельность' },
]

export default function AppNav() {
  const path = usePathname() || ''
  if (HIDE_PREFIXES.some(p => path === p || path.startsWith(p + '/'))) return null

  return (
    <nav className="bg-white border-b border-neutral-200 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-1">
        <span className="font-bold mr-4">U2B</span>
        {LINKS.map(x => (
          <Link key={x.href} href={x.href} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-100">{x.l}</Link>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <OrgSwitcher />
          <UserMenu />
        </div>
      </div>
    </nav>
  )
}
