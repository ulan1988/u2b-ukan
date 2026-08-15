import { NextRequest, NextResponse } from 'next/server'
import { carveCard } from '@/services/settings.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «Вынести в карточку»: { lines:[{specItemId, qty}], contactId?, comment?, deadline? }
// → новая заявка в Приёмку со специмами; остаток проекта уменьшается.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.lines?.length) return NextResponse.json({ error: 'Не выбраны позиции' }, { status: 400 })
  const res: any = await carveCard(s.orgId, params.id,
    { contactId: b.contactId, fromName: b.fromName, comment: b.comment, deadline: b.deadline },
    b.lines, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
