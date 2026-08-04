import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import WarehousePortal from '@/components/portals/WarehousePortal'

export const dynamic = 'force-dynamic'

export default async function WarehousePage() {
  const session = await getSession()
  if (!session) redirect('/login?from=/warehouse')
  if (session.role !== 'warehouse_manager') redirect('/admin')
  return <WarehousePortal user={session} />
}
