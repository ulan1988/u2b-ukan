import { NextRequest, NextResponse } from 'next/server'
import { acceptDocByContragent } from '@/services/document.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Контрагент принимает документ/возврат в своём кабинете.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  if (!t.contragentId) return NextResponse.json({ error: 'Кабинет не привязан к контрагенту' }, { status: 400 })
  const res = await acceptDocByContragent(params.id, t.contragentId, s.name)
  await pushSignal()
  return NextResponse.json(res)
}
