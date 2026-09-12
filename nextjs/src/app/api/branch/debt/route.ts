import { NextRequest, NextResponse } from 'next/server'
import { payDebt } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Погашение долга по чеку (касса магазина): { cardId, amount, accountId, uid }.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const { uid, cardId, amount, accountId } = b || {}
  if (!cardId || !accountId || !(Number(amount) > 0)) return NextResponse.json({ error: 'Нужны чек, сумма и счёт' }, { status: 400 })
  await resolveTarget(s, uid)
  const res: any = await payDebt(cardId, Number(amount), accountId, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
