import { NextRequest, NextResponse } from 'next/server'
import { copyColorPrices } from '@/services/pricing.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Копировать цены с подгруппы-цвета на другие: POST { orgId?, sourceSub, targetSubs[], cols }
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const orgId = b.orgId || s.orgId
  const r = await copyColorPrices(orgId, b.sourceSub, b.targetSubs || [], b.cols || {})
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r)
}
