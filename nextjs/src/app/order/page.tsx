import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import OrderDeskApp from '@/components/OrderDeskApp'

export const dynamic = 'force-dynamic'
// Отдельный PWA-манифест — этот кабинет ставится как самостоятельное приложение.
export const metadata: Metadata = { title: 'U2B Заказ', manifest: '/order.webmanifest' }

export default async function OrderDeskPage() {
  const session = await getSession()
  if (!session) redirect('/login?from=/order')
  const allowed = session.role === 'order_desk' || ['admin', 'super_admin'].includes(session.role)
  if (!allowed) redirect('/login')
  return <OrderDeskApp user={{ id: session.id, name: session.name, orgId: session.orgId }} />
}
