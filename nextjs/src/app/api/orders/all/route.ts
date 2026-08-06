import { NextRequest, NextResponse } from 'next/server'
import { postAllToBook } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «Провести все» — все карточки К учёту (кроме отложенных) в бухгалтерию.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  const res = await postAllToBook(orgId)
  await pushSignal()
  return NextResponse.json(res)
}
