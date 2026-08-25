import { NextRequest, NextResponse } from 'next/server'
import { allocateAdvance } from '@/services/projectFinance.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Распределить аванс клиента по проектам (перезапись строк распределения).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const r = await allocateAdvance(b.orgId || s.orgId, b.clientId, Array.isArray(b.allocations) ? b.allocations : [])
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  await pushSignal()
  return NextResponse.json(r)
}
