import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import WarehousePortal from '@/components/portals/WarehousePortal'

export const dynamic = 'force-dynamic'

export default async function WarehousePage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/warehouse')
  const isAdmin = ['admin', 'super_admin', 'bookkeeper'].includes(session.role)
  if (session.role === 'warehouse_manager') return <WarehousePortal user={session} />
  if (isAdmin) {
    const target = await userBySlug(params.slug)
    if (target) return <WarehousePortal user={target} />
  }
  redirect('/admin')
}
