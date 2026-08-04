import { NextRequest, NextResponse } from 'next/server'
import { listForLogist } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  return NextResponse.json(await listForLogist(s.orgId, s.id))
}
