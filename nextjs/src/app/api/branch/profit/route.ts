import { NextRequest, NextResponse } from 'next/server'
import { profitByProduct } from '@/services/finance.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Рентабельность по товару за период: ?from&to&uid.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const t = await resolveTarget(s, sp.get('uid'))
  return NextResponse.json(await profitByProduct(t.orgId, sp.get('from') || undefined, sp.get('to') || undefined))
}
