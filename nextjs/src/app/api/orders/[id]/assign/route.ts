import { NextRequest, NextResponse } from 'next/server'
import { assignSchema } from '@/dto/order.dto'
import { assignLogist } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const parsed = assignSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Не указан логист' }, { status: 400 })
  const res = await assignLogist(params.id, parsed.data.respUserId, s)
  await pushSignal()
  return NextResponse.json(res)
}
