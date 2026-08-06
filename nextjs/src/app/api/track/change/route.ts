import { NextRequest, NextResponse } from 'next/server'
import { requestChange } from '@/services/order.service'

export const dynamic = 'force-dynamic'

// Публичный — без сессии (см. middleware /api/track).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  if (!b?.cardId || !b?.text) return NextResponse.json({ error: 'Укажите заявку и текст' }, { status: 400 })
  const r = await requestChange(b.cardId, b.text, b.phone)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r)
}
