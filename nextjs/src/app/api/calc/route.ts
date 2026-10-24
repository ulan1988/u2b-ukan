import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import { getCalc, saveCalc } from '@/services/calc.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  return NextResponse.json(await getCalc(s.orgId))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await saveCalc(s.orgId, b.id || null, b.name || 'Расчёт', b.data || {}))
}
