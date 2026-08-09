import { NextRequest, NextResponse } from 'next/server'
import { listForBranch } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Карточки филиала: где он поставщик (leg=1, проходят через него) + свои по орг.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  return NextResponse.json(await listForBranch(s))
}
