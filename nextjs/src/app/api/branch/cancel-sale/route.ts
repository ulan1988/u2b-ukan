import { NextRequest, NextResponse } from 'next/server'
import { cancelStoreSale } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Отмена продажи (касса магазина): { cardId, uid }.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b?.cardId) return NextResponse.json({ error: 'Нужен чек' }, { status: 400 })
  const t = await resolveTarget(s, b.uid)
  const res: any = await cancelStoreSale(b.cardId, t as any)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
