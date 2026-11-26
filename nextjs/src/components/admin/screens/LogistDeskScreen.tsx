'use client'
// ДОСКА ЛОГИСТА В АДМИНКЕ (правило владельца 26.11.2026): «эта страница очень успешная — над Входящими
// её же, 100% копия». Та же доска (LogistBoard), позиции всех логистов орг. По умолчанию — режим просмотра,
// кнопки проводки появляются только в «🚚 Режим логиста».
import LogistBoard from '@/components/portals/LogistBoard'
import { useAdmin } from '@/components/admin/AdminChrome'

export default function LogistDeskScreen() {
  const a = useAdmin()
  if (!a?.user) return null
  return <LogistBoard key={a.orgId} user={a.user} backHref="/admin/incoming" adminOrgId={a.orgId} />
}
