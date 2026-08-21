import { NextRequest, NextResponse } from 'next/server'
import { payCard, unpostSale } from '@/services/cashier.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// POST — оплатить (продать): { cash, kaspi, change, changeFrom }. DELETE — отменить продажу.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const res: any = await payCard(params.id, { cash: b?.cash, kaspi: b?.kaspi, qr: b?.qr, change: b?.change, changeFrom: b?.changeFrom }, s)
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
