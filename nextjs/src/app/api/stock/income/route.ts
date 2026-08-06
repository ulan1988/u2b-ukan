import { NextRequest, NextResponse } from 'next/server'
import { manualIncome } from '@/services/warehouse.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const r = await manualIncome(s.orgId, b?.name || '', Number(b?.qty) || 0, b?.unit || 'шт')
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r)
}
