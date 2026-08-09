import { NextRequest, NextResponse } from 'next/server'
import { updatePositionDetail, addPosition, deletePosition } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// PATCH — изменить позицию (posId + поля). POST — добавить. DELETE — удалить (?posId=).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const b = await req.json().catch(() => null)
  if (!b?.posId) return NextResponse.json({ error: 'posId обязателен' }, { status: 400 })
  const res: any = await updatePositionDetail(params.id, b.posId, b, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 403 })
  await pushSignal()
  return NextResponse.json(res)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const b = await req.json().catch(() => ({}))
  const res: any = await addPosition(params.id, b || {}, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 403 })
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const posId = new URL(req.url).searchParams.get('posId')
  if (!posId) return NextResponse.json({ error: 'posId обязателен' }, { status: 400 })
  const res: any = await deletePosition(params.id, posId, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 403 })
  await pushSignal()
  return NextResponse.json(res)
}
