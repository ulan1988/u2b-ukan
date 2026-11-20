import { NextRequest, NextResponse } from 'next/server'
import { stockOnDateGrouped } from '@/services/warehouse.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { today } from '@/lib/num'

export const dynamic = 'force-dynamic'

// Остаток Центр-Склада на дату для кабинета логиста (его ревизия сверяется с этой датой).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const t = await resolveTarget(s, sp.get('uid'))
  const d = sp.get('date') || today()
  return NextResponse.json(await stockOnDateGrouped(t.orgId, /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today()))
}
