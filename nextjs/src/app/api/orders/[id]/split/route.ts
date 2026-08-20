import { NextRequest, NextResponse } from 'next/server'
import { splitCard } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Сплит карточки: { posIds: string[] } — выбранные позиции → новая карточка.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const posIds = Array.isArray(b?.posIds) ? b.posIds.filter((x: any) => typeof x === 'string') : []
  const res: any = await splitCard(params.id, posIds, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
