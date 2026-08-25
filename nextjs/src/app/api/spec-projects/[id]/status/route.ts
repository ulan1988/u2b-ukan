import { NextRequest, NextResponse } from 'next/server'
import { setProjectStatus } from '@/services/projectFinance.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Закрыть/переоткрыть проект (закрытие вручную; фронт предупреждает при балансе ≠ 0).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const status = b.status === 'closed' ? 'closed' : 'active'
  const r = await setProjectStatus(b.orgId || s.orgId, params.id, status)
  await pushSignal()
  return NextResponse.json(r)
}
