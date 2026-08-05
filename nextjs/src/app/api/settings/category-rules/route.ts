import { NextRequest, NextResponse } from 'next/server'
import { listRules, saveRule } from '@/services/categoryRule.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listRules(orgId))
}

export async function PUT(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.category) return NextResponse.json({ error: 'category обязателен' }, { status: 400 })
  return NextResponse.json(await saveRule(s.orgId, b))
}
