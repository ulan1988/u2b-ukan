import { NextRequest, NextResponse } from 'next/server'
import { movementBoard } from '@/services/movement.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// «Документ движений»: четыре полосы (заказы → заказы поставщикам → приход → расход).
// Только чтение.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const orgId = q.get('orgId') || s.orgId
  if (!orgId) return NextResponse.json({ error: 'Нет организации' }, { status: 400 })
  return NextResponse.json(await movementBoard(orgId, q.get('date') || undefined))
}
