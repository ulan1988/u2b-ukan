import { NextRequest, NextResponse } from 'next/server'
import { listForBranch } from '@/services/order.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Карточки филиала: где он поставщик (leg=1, проходят через него) + свои по орг.
// uid — админ смотрит кабинет «от имени» филиала (resolveTarget), иначе сам филиал.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  return NextResponse.json(await listForBranch({ name: t.name, orgId: t.orgId }))
}
