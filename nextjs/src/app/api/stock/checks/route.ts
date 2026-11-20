import { NextRequest, NextResponse } from 'next/server'
import { createCheck, listChecks } from '@/services/stockCheck.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { stockCheckSchema } from '@/dto/stockCheck.dto'

export const dynamic = 'force-dynamic'

// GET  — список ревизий своей орг (админ читает в «Склад → Ревизии»).
// POST — логист отправляет пересчёт за день; склад при этом не трогается.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const orgId = sp.get('orgId') || (await resolveTarget(s, sp.get('uid'))).orgId
  return NextResponse.json(await listChecks(orgId))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const t = await resolveTarget(s, b?.uid)
  const p = stockCheckSchema.safeParse(b)
  if (!p.success) return NextResponse.json({ error: 'Нужны дата и строки' }, { status: 400 })
  const res: any = await createCheck(t.orgId, p.data, s)
  return NextResponse.json(res, { status: res?.ok === false ? 400 : 200 })
}
