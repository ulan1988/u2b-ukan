import { redirect } from 'next/navigation'
import { getSession, homePathFor } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Корень: раскидываем по ролям (админ→/admin, порталы→свой кабинет), гость→/login.
export default async function Home() {
  const s = await getSession()
  redirect(s ? homePathFor(s) : '/login')
}
