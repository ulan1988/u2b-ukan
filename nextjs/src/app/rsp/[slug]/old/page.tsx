import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import LogistPortal from '@/components/portals/LogistPortal'

export const dynamic = 'force-dynamic'

// СТАРЫЙ кабинет логиста (списки). Основной экран теперь доска на /rsp/[slug];
// старый оставлен по прямой ссылке — вернуться на него можно в один клик, если на доске затык.
export default async function LogistOldPage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/rsp')
  if (session.role === 'logist') return <LogistPortal user={session} />
  if (['admin', 'super_admin', 'bookkeeper'].includes(session.role)) {
    const target = await userBySlug(params.slug)
    if (target) return <LogistPortal user={target} viewAs />
  }
  redirect('/admin')
}
