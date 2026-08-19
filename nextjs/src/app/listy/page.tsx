import { getSession } from '@/lib/auth'
import SheetCabinet from '@/components/portals/SheetCabinetPublic'
import CabinetLogin from '@/components/portals/CabinetLogin'

export const dynamic = 'force-dynamic'

// Отдельный кабинет листов со СВОИМ входом (логин/пароль). Залогинен → кабинет,
// иначе → форма входа. Публичный по имени — отдельно на /listy/[slug].
export default async function ListyPage() {
  const session = await getSession()
  if (!session) return <CabinetLogin />
  return <SheetCabinet sessionUser={{ name: session.name, orgId: session.orgId }} />
}
