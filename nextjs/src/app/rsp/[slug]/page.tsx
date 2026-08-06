import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import LogistPortal from '@/components/portals/LogistPortal'

export const dynamic = 'force-dynamic'

export default async function LogistPortalPage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/rsp')
  const isAdmin = ['admin', 'super_admin', 'bookkeeper'].includes(session.role)
  if (session.role === 'logist') return <LogistPortal user={session} />
  // Админ смотрит кабинет логиста по slug (режим просмотра).
  if (isAdmin) {
    const target = await userBySlug(params.slug)
    if (target) return <LogistPortal user={target} viewAs />
  }
  redirect('/admin')
}
