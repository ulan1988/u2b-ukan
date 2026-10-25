import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { seedIfEmpty } from '@/services/seed.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Служебный роут: только супер-админ (создаёт стартовые данные на пустой базе).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || s.role !== 'super_admin') return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  return NextResponse.json(await seedIfEmpty())
}
