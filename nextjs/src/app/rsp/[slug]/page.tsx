import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import LogistPortal from '@/components/portals/LogistPortal'

export const dynamic = 'force-dynamic'

export default async function LogistPortalPage() {
  const session = await getSession()
  if (!session) redirect('/login?from=/rsp')
  if (session.role !== 'logist') redirect('/admin')
  return <LogistPortal user={session} />
}
