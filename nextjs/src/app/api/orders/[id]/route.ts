import { NextRequest, NextResponse } from 'next/server'
import { getCard, updateCard } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const card = await getCard(params.id)
  if (!card) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  return NextResponse.json(card)
}

// Обновить карточку (получатель/срок/коммент) — стол приёмки.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await updateCard(params.id, b || {}, s))
}
