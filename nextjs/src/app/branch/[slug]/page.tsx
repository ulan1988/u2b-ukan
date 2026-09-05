import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { userBySlug } from '@/services/auth.service'
import { orgById } from '@/repositories/refs.repo'
import BranchPortal from '@/components/portals/BranchPortal'
import SellerPortal from '@/components/portals/SellerPortal'

export const dynamic = 'force-dynamic'

// Кабинет филиала. Вид зависит от организации: производитель (`producer_seller`) получает стол
// мастера (заказы/производство/листы), магазин-продавец (`seller`) — кассу продавца.
async function portalFor(user: { id: string; name: string; orgId: string; slug?: string | null }) {
  const org = await orgById(user.orgId)
  const u = { id: user.id, name: user.name, orgId: user.orgId, slug: user.slug ?? undefined }
  if (org?.kind === 'seller') return <SellerPortal user={u} orgName={org.name} />
  return <BranchPortal user={u} />
}

export default async function BranchPage({ params }: { params: { slug: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?from=/branch')
  const isAdmin = ['admin', 'super_admin', 'bookkeeper'].includes(session.role)
  if (session.role === 'branch') return await portalFor(session as any)
  if (isAdmin) {
    const target = await userBySlug(params.slug)
    if (target) return await portalFor(target)
  }
  redirect('/admin')
}
