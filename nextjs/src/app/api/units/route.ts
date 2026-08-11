import { NextRequest, NextResponse } from 'next/server'
import { listUnits, clearUnits, insertUnits } from '@/repositories/catalog.repo'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await listUnits())
}

// Полная замена справочника единиц (список приходит с UI). Одна помечается по умолчанию.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const items = (await req.json().catch(() => [])) as any[]
  await clearUnits()
  const vals = (Array.isArray(items) ? items : []).filter(x => (x.name || '').trim())
    .map((x, i) => ({ name: String(x.name).trim(), isDefault: !!x.isDefault, sortOrder: i, archived: false }))
  await insertUnits(vals as any)
  return NextResponse.json({ ok: true })
}
