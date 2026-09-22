import { NextRequest, NextResponse } from 'next/server'
import { accountsOverview } from '@/services/shift.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Свод счетов: балансы головного + филиалов, филиальские деньги = «в ожидании» инкассации.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  return NextResponse.json(await accountsOverview(s.orgId))
}
