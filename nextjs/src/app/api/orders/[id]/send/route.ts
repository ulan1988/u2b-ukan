import { NextRequest, NextResponse } from 'next/server'
import { sendPositions } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Отправка логисту (кабинет мастера): { posIds?: string[] }.
// posIds задан → частичная отправка выбранных позиций; пуст/не задан → отправить целиком.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const posIds = Array.isArray(b?.posIds) ? b.posIds.filter((x: any) => typeof x === 'string') : undefined
  const res: any = await sendPositions(params.id, posIds, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
