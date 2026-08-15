import { NextRequest, NextResponse } from 'next/server'
import { specProjectDetail } from '@/services/settings.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Деталь проекта: позиции с остатком (кол-во/вынесено/остаток) + дочерние карточки.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const d = await specProjectDetail(params.id)
  if (!d) return NextResponse.json({ error: 'Проект не найден' }, { status: 404 })
  return NextResponse.json(d)
}
