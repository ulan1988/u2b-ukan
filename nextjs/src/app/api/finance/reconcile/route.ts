import { NextRequest, NextResponse } from 'next/server'
import { contragentReconciliation } from '@/services/finance.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Акт сверки по контрагенту: /api/finance/reconcile?contragentId=&from=&to=
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const u = new URL(req.url)
  const contragentId = u.searchParams.get('contragentId')
  if (!contragentId) return NextResponse.json({ error: 'contragentId обязателен' }, { status: 400 })
  const from = u.searchParams.get('from') || undefined
  const to = u.searchParams.get('to') || undefined
  return NextResponse.json(await contragentReconciliation(s.orgId, contragentId, from, to))
}
