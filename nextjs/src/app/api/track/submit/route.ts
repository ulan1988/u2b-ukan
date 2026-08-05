import { NextRequest, NextResponse } from 'next/server'
import { submitLead } from '@/services/public.service'

export const dynamic = 'force-dynamic'

// Публичный — без сессии (см. middleware /api/track).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  if (!b?.name || !b?.phone) return NextResponse.json({ error: 'Укажите имя и телефон' }, { status: 400 })
  const r = await submitLead(b.name, b.phone, b.text || '')
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r, { status: 201 })
}
