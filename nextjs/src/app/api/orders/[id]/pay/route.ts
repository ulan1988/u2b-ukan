import { NextRequest, NextResponse } from 'next/server'
import { payCard, unpostSale } from '@/services/cashier.service'
import { paySchema } from '@/dto/order.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// POST — оплатить (продать): { cash, kaspi, qr, change, changeFrom, date? }. DELETE — отменить продажу.
// date — рабочая дата (проведение задним числом): расходная + платежи лягут на этот день.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = paySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные оплаты' }, { status: 400 })
  const b = parsed.data
  const res: any = await payCard(params.id, { cash: b.cash, kaspi: b.kaspi, qr: b.qr, change: b.change, changeFrom: b.changeFrom, localDebt: !!b.localDebt, markOnly: !!b.markOnly, finalize: !!b.finalize, date: b.date }, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const res: any = await unpostSale(params.id, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
