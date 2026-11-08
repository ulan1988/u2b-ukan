import { NextRequest, NextResponse } from 'next/server'
import { exchangeSale } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { exchangeSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Обмен по чеку (касса магазина): { cardId, back[], out[], uid }.
// Сданное — возвратной накладной на склад, выданное — расходной; деньги не трогаем
// (обмен только на равную сумму), исходный чек остаётся в отчёте своего дня.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = exchangeSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные обмена' }, { status: 400 })
  const { uid, cardId, back, out } = parsed.data
  await resolveTarget(s, uid)   // просмотр-как: доступ филиала (см. viewas)
  const res: any = await exchangeSale(cardId, { back, out }, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
