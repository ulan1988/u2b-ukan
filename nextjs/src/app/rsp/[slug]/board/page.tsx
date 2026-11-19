import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import LogistBoard from '@/components/portals/LogistBoard'

export const dynamic = 'force-dynamic'

// ВТОРОЙ ВИД кабинета логиста — доска (прототип). Старый кабинет /rsp/[slug] не трогаем:
// сюда заходят по ссылке «🧪 Доска», экран только читает и ничего не пишет в базу.
export default async function LogistBoardPage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/rsp')
  const back = `/rsp/${params.slug}`
  if (session.role === 'logist') return <LogistBoard user={session} backHref={back} />
  if (['admin', 'super_admin', 'bookkeeper'].includes(session.role)) {
    const target = await userBySlug(params.slug)
    if (target) return <LogistBoard user={target as any} viewAs backHref={back} />
  }
  redirect('/admin')
}
