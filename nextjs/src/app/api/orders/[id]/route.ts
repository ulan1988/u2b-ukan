import { NextRequest, NextResponse } from 'next/server'
import { getCard } from '@/services/order.service'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const card = await getCard(params.id)
  if (!card) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  return NextResponse.json(card)
}
