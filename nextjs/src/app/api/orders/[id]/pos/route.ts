import { NextRequest, NextResponse } from 'next/server'
import { posStatusSchema } from '@/dto/order.dto'
import { setPositions } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const parsed = posStatusSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Неверный статус' }, { status: 400 })
  return NextResponse.json(await setPositions(params.id, parsed.data.posId, parsed.data.status, s))
}
