import { redirect } from 'next/navigation'
import { getSession, homePathFor } from '@/lib/auth'
import AdminChrome from '@/components/admin/AdminChrome'

export const dynamic = 'force-dynamic'

// Каркас админки (сайдбар/топбар) — общий для всех /admin/* адресов, монтируется один раз.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/admin')
  if (!['admin', 'super_admin', 'bookkeeper'].includes(session.role)) redirect(homePathFor(session))
  return <AdminChrome user={session}>{children}</AdminChrome>
}
