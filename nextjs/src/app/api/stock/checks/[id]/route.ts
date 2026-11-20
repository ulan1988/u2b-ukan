import { NextRequest, NextResponse } from 'next/server'
import { getCheck, acceptCheck, deleteCheck } from '@/services/stockCheck.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'
const ADMIN = ['admin', 'super_admin', 'bookkeeper']

// Документ ревизии: слева склад (учёт на дату), справа ревизия (факт), третья — разница.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const orgId = sp.get('orgId') || (await resolveTarget(s, sp.get('uid'))).orgId
  const res: any = await getCheck(orgId, params.id)
  return NextResponse.json(res, { status: res?.ok === false ? 404 : 200 })
}

// Пометка «разобрано» (и обратно) — только админ. Склад по-прежнему не трогается.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await acceptCheck(b?.orgId || s.orgId, params.id))
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  return NextResponse.json(await deleteCheck(orgId, params.id))
}
