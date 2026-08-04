import { NextRequest, NextResponse } from 'next/server'
import { track } from '@/services/order.service'

export const dynamic = 'force-dynamic'

// Публичный — доступен без сессии (см. middleware PUBLIC).
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Укажите номер заявки' }, { status: 400 })
  const data = await track(id.trim())
  if (!data) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  return NextResponse.json(data)
}
