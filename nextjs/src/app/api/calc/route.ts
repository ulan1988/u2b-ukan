import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import { getCalc, saveCalc, createCalc, deleteCalc } from '@/services/calc.service'

export const dynamic = 'force-dynamic'

// GET ?id — лист-вкладка (без id — последний открытый). В ответе всегда tabs: список вкладок.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  return NextResponse.json(await getCalc(s.orgId, id))
}

// POST { action } — save (по умолчанию) | create (новая вкладка) | delete.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (b.action === 'create') return NextResponse.json(await createCalc(s.orgId, b.name || '', b.fromId || null))
  if (b.action === 'delete') return NextResponse.json(await deleteCalc(s.orgId, b.id))
  return NextResponse.json(await saveCalc(s.orgId, b.id || null, b.name || 'Расчёт', b.data || {}))
}
