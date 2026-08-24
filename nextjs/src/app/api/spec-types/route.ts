import { NextRequest, NextResponse } from 'next/server'
import { listSpecTypes, createSpecType } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId') || s.orgId
  const all = !!url.searchParams.get('all')   // all=1 → включая архивные (для восстановления)
  return NextResponse.json(await listSpecTypes(orgId, all))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
  return NextResponse.json(await createSpecType(b.orgId || s.orgId, b), { status: 201 })
}
