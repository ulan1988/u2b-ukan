import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import LogistBoard from '@/components/portals/LogistBoard'

export const dynamic = 'force-dynamic'

// ОСНОВНОЙ экран логиста — доска (колонка = поставщик → готов к отправке → продано).
// Старый кабинет-список остался на /rsp/[slug]/old: ссылка «старый кабинет» в шапке доски.
export default async function LogistPortalPage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/rsp')
  const back = `/rsp/${params.slug}/old`
  if (session.role === 'logist') return <LogistBoard user={session} backHref={back} />
  if (['admin', 'super_admin', 'bookkeeper'].includes(session.role)) {
    const target = await userBySlug(params.slug)
    if (target) return <LogistBoard user={target as any} viewAs backHref={back} />
  }
  redirect('/admin')
}
