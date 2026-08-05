import { NextRequest, NextResponse } from 'next/server'
import { register } from '@/services/public.service'

export const dynamic = 'force-dynamic'

// Публичный — саморегистрация клиента (см. middleware /api/auth).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  if (!b?.name || !b?.email || !b?.password) return NextResponse.json({ error: 'Заполните имя, email и пароль' }, { status: 400 })
  const r = await register(b.name, b.email, b.password, b.phone)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  return NextResponse.json(r, { status: 201 })
}
