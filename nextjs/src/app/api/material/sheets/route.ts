import { NextRequest, NextResponse } from 'next/server'
import { sheetsByColor } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Целые листы по цветам (глянец/мат) — для кабинета-передатчика мастера.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const orgId = sp.get('all') ? undefined : (sp.get('orgId') || s.orgId)   // all=1 → агрегат по всем орг
  return NextResponse.json(await sheetsByColor(orgId))
}
