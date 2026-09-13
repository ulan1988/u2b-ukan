import { NextRequest, NextResponse } from 'next/server'
import { produceToStock } from '@/services/producer.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Производство НА ЗАПАС (кабинет мастера): { items:[{name,color,cm,qty}], uid? } → выпуск на склад Нипы.
// Без покупателя и без оплаты — только приход товара на склад (в Кассе дня «производство в запас»).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const items = Array.isArray(b?.items) ? b.items : []
  if (!items.length) return NextResponse.json({ error: 'Нет позиций' }, { status: 400 })
  const t = await resolveTarget(s, b?.uid)
  const res: any = await produceToStock(t.orgId, items, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
