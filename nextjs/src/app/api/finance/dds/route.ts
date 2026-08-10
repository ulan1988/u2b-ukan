import { NextRequest, NextResponse } from 'next/server'
import { ddsReport } from '@/services/finmoney.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Отчёт ДДС: /api/finance/dds?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const u = new URL(req.url)
  const from = u.searchParams.get('from') || '2000-01-01'
  const to = u.searchParams.get('to') || '2100-01-01'
  return NextResponse.json(await ddsReport(s.orgId, from, to))
}
