import { NextRequest, NextResponse } from 'next/server'
import { returnSale } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { returnSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Возврат по чеку (касса магазина): { cardId, posIds?, accountId, uid }.
// posIds пусто → весь чек. Возвратная накладная (+склад) + возврат денег со счёта (гасит долг).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = returnSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные возврата' }, { status: 400 })
  const { uid, cardId, posIds, accountId } = parsed.data
  await resolveTarget(s, uid)   // просмотр-как: доступ филиала (см. viewas)
  const res: any = await returnSale(cardId, { posIds, accountId }, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
