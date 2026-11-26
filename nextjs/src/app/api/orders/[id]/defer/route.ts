import { NextRequest, NextResponse } from 'next/server'
import { deferPositions } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// ⏸ Отложено (доска логиста): { posIds } — отмеченные позиции уезжают в карточку-продолжение
// и остаются в своей колонке; исходная проводится с остальными. Только логист и админ.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (!['admin', 'super_admin', 'logist'].includes(s.role)) return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
  const b = await req.json().catch(() => null)
  const posIds = Array.isArray(b?.posIds) ? b.posIds.filter((x: any) => typeof x === 'string') : []
  const res: any = await deferPositions(decodeURIComponent(params.id), posIds, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
