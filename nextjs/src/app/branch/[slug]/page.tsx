import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import BranchPortal from '@/components/portals/BranchPortal'

export const dynamic = 'force-dynamic'

export default async function BranchPage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/branch')
  const isAdmin = ['admin', 'super_admin', 'bookkeeper'].includes(session.role)
  if (session.role === 'branch') return <BranchPortal user={session} />
  if (isAdmin) {
    const target = await userBySlug(params.slug)
    if (target) return <BranchPortal user={target} />
  }
  redirect('/admin')
}
