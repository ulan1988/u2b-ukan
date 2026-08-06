import { NextRequest, NextResponse } from 'next/server'
import { updatePositionDetail, addPosition, deletePosition } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// PATCH — изменить позицию (posId + поля). POST — добавить. DELETE — удалить (?posId=).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const b = await req.json().catch(() => null)
  if (!b?.posId) return NextResponse.json({ error: 'posId обязателен' }, { status: 400 })
  return NextResponse.json(await updatePositionDetail(params.id, b.posId, b, s))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await addPosition(params.id, b || {}, s), { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const posId = new URL(req.url).searchParams.get('posId')
  if (!posId) return NextResponse.json({ error: 'posId обязателен' }, { status: 400 })
  return NextResponse.json(await deletePosition(params.id, posId, s))
}
