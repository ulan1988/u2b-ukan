import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SheetCabinet from '@/components/portals/SheetCabinet'

export const dynamic = 'force-dynamic'

// Отдельный кабинет листов (для рабочих). Открытая страница /listy — вносят «взял N».
export default async function ListyPage() {
  const session = await getSession()
  if (!session) redirect('/login?from=/listy')
  return <SheetCabinet user={{ name: session.name, orgId: session.orgId }} />
}
