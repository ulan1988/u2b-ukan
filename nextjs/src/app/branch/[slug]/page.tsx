import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import BranchPortal from '@/components/portals/BranchPortal'

export const dynamic = 'force-dynamic'

export default async function BranchPage() {
  const session = await getSession()
  if (!session) redirect('/login?from=/branch')
  if (session.role !== 'branch') redirect('/admin')
  return <BranchPortal user={session} />
}
