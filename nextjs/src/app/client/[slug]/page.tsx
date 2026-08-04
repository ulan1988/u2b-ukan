import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ClientApp from '@/components/portals/ClientApp'

export const dynamic = 'force-dynamic'

export default async function ClientPage() {
  const session = await getSession()
  if (!session) redirect('/login?from=/client')
  if (!['client', 'supplier_client', 'branch'].includes(session.role)) redirect('/admin')
  return <ClientApp user={session} />
}
