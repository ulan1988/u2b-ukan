import { NextRequest, NextResponse } from 'next/server'
import { profitDay, postProfitDay, unpostProfitDay } from '@/services/profit.service'
import { sessionFromRequest } from '@/lib/auth'
import { today } from '@/lib/num'

export const dynamic = 'force-dynamic'

const ADMIN = ['admin', 'super_admin', 'bookkeeper']

// Прибыль дня магазина (деление денег: себестоимость / наценка). Орг — из админ-селектора.
// GET ?orgId&date — расчёт. POST { orgId, date, action: 'post'|'unpost' } — провести / отменить.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  return NextResponse.json(await profitDay(sp.get('orgId') || s.orgId, sp.get('date') || today()))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const orgId = b?.orgId || s.orgId
  const date = b?.date || today()
  if (b?.action === 'unpost') return NextResponse.json(await unpostProfitDay(orgId, date))
  return NextResponse.json(await postProfitDay(orgId, date))
}
