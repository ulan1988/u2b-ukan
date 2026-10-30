import { NextRequest, NextResponse } from 'next/server'
import { produceToBase } from '@/services/producer.service'
import { tobaseSchema } from '@/dto/order.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «Внести в базу»: изделия карточки → товар на складе (создание товара + выпуск).
// date — рабочая дата (проведение задним числом) документа производства.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = tobaseSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверная дата' }, { status: 400 })
  const res: any = await produceToBase(params.id, s, parsed.data.date)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
