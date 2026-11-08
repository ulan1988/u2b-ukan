import { NextRequest, NextResponse } from 'next/server'
import { bonusDay } from '@/services/bonus.service'
import { sessionFromRequest } from '@/lib/auth'
import { today } from '@/lib/num'

export const dynamic = 'force-dynamic'

// Бонусы дня магазина (товар соседа): сколько заработали, доля головного, что вернуть соседям.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  return NextResponse.json(await bonusDay(sp.get('orgId') || s.orgId, sp.get('date') || today()))
}
