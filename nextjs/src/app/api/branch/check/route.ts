import { NextRequest, NextResponse } from 'next/server'
import { editCheck } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { editCheckSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Правка пробитого чека: { cardId, positions[], cash/kaspi/qr, discount…, uid }.
// Сторнирует старую расходную и оплаты, затем проводит чек заново новым составом.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = editCheckSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные чека' }, { status: 400 })
  const { uid, cardId, ...input } = parsed.data
  await resolveTarget(s, uid)   // просмотр-как: правим от имени филиала
  const res: any = await editCheck(cardId, input as any, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
