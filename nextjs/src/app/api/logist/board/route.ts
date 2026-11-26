import { NextRequest, NextResponse } from 'next/server'
import { logistBoard } from '@/services/order.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Доска логиста (прототип, только чтение): колонки-поставщики + этапы.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  // all=1 — доска ВСЕХ логистов своей орг для админки («Доска логиста»), только админу.
  if (sp.get('all') === '1') {
    if (!['admin', 'super_admin'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    return NextResponse.json(await logistBoard(sp.get('orgId') || s.orgId, s.id, true))
  }
  const t = await resolveTarget(s, sp.get('uid'))
  return NextResponse.json(await logistBoard(t.orgId, t.id))
}
