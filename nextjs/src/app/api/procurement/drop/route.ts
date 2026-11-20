import { NextRequest, NextResponse } from 'next/server'
import { dropDemand } from '@/services/procurement.service'
import { dropDemandSchema } from '@/dto/procurement.dto'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = dropDemandSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные' }, { status: 400 })
  const r = await dropDemand(s.orgId, parsed.data.names, s)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r)
}
