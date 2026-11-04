import { NextRequest, NextResponse } from 'next/server'
import { applyToChildren } from '@/services/docSync.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «Применить всем»: разослать состав/кол-во/цены материнской расходной по дочерним
// (зеркальным приходным филиалов). Доступ — только админ/бухгалтер головного.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const res: any = await applyToChildren(params.id, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
