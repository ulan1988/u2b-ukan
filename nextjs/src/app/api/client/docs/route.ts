import { NextRequest, NextResponse } from 'next/server'
import { listDocsForContragent } from '@/services/document.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Документы контрагента для его кабинета: { purchases, sales, returns }.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  if (!t.contragentId) return NextResponse.json({ purchases: [], sales: [], returns: [] })
  return NextResponse.json(await listDocsForContragent(t.orgId, t.contragentId))
}
