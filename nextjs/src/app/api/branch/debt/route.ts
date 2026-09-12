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
  const { uid, cardId } = b || {}
  // смешанная оплата: splits [{accountId, amount}]; либо одиночная {amount, accountId} (совместимость).
  const splits: { accountId: string; amount: number }[] = Array.isArray(b?.splits) ? b.splits
    : (b?.accountId && Number(b?.amount) > 0 ? [{ accountId: b.accountId, amount: Number(b.amount) }] : [])
  if (!cardId || !splits.length) return NextResponse.json({ error: 'Нужны чек, счёт и сумма' }, { status: 400 })
  await resolveTarget(s, uid)
  const res: any = await payDebt(cardId, splits, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
