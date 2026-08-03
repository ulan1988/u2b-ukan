import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AdminShell from '@/components/admin/AdminShell'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/login?from=/admin')
  // Не админ — уводим на рабочую доску (порталы по ролям появятся позже).
  if (!['admin', 'super_admin', 'bookkeeper'].includes(session.role)) redirect('/board')
  return <AdminShell user={session} />
}
