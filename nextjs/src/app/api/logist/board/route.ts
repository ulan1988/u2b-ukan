import { NextRequest, NextResponse } from 'next/server'
import { logistBoard } from '@/services/order.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Доска логиста (прототип, только чтение): колонки-поставщики + этапы.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  return NextResponse.json(await logistBoard(t.orgId, t.id))
}
