import { NextRequest, NextResponse } from 'next/server'
import { sellDirect } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { sellSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Касса продавца: пробить чек — { positions[], contactId?, cash, kaspi, qr, change, uid }.
// Одним вызовом: карточка-продажа в книге филиала + расходная (склад −) + оплаты.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = sellSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные чека' }, { status: 400 })
  const { uid, ...input } = parsed.data
  const t = await resolveTarget(s, uid)
  const res: any = await sellDirect(t.orgId, input as any, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
