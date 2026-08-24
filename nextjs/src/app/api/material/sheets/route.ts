import { NextRequest, NextResponse } from 'next/server'
import { sheetsByColor, sheetsByOrg } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Целые листы по цветам (глянец/мат) — для кабинета-передатчика мастера.
// byOrg=1 → по филиалам (дашборд головного). all=1 → агрегат по всем орг.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  if (sp.get('byOrg')) return NextResponse.json(await sheetsByOrg())
  const orgId = sp.get('all') ? undefined : (sp.get('orgId') || s.orgId)
  return NextResponse.json(await sheetsByColor(orgId))
}
