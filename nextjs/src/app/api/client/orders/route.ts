import { NextRequest, NextResponse } from 'next/server'
import { createOrderSchema } from '@/dto/order.dto'
import { createOrder, listForClient } from '@/services/order.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  return NextResponse.json(await listForClient(t.orgId, t.id))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  // Кабинет: заявка всегда от имени клиента, продажа, во Входящие.
  // uid — админ создаёт «от имени» кабинета (resolveTarget), иначе сам пользователь.
  // Точная связка: если кабинет привязан к контрагенту — заявка идёт на него (contactId).
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  const parsed = createOrderSchema.safeParse({ ...body, orgId: t.orgId, kind: 'sale', source: 'cabinet', fromId: t.id, fromName: t.name, contactId: t.contragentId || undefined })
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте позиции' }, { status: 400 })
  const res = await createOrder(parsed.data, s)
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
