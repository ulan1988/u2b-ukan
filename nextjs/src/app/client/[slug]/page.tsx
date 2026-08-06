import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import ClientApp from '@/components/portals/ClientApp'

export const dynamic = 'force-dynamic'

export default async function ClientPage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/client')
  const isAdmin = ['admin', 'super_admin', 'bookkeeper'].includes(session.role)
  if (['client', 'supplier_client', 'branch'].includes(session.role)) return <ClientApp user={session} />
  if (isAdmin) {
    const target = await userBySlug(params.slug)
    if (target) return <ClientApp user={target} viewAs />
  }
  redirect('/admin')
}
