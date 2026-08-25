import { NextRequest, NextResponse } from 'next/server'
import { reconcileProjects } from '@/services/projectFinance.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Акт сверки по выбранным проектам (ids через запятую).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId') || s.orgId
  const ids = (url.searchParams.get('ids') || '').split(',').map(x => x.trim()).filter(Boolean)
  if (!ids.length) return NextResponse.json({ error: 'Не выбраны проекты' }, { status: 400 })
  return NextResponse.json(await reconcileProjects(orgId, ids))
}
