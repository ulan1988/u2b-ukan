import { NextRequest, NextResponse } from 'next/server'
import { editUser, deactivateUser } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin'].includes(s.role)) return NextResponse.json({ error: 'Только администратор' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await editUser(params.id, b || {}))
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin'].includes(s.role)) return NextResponse.json({ error: 'Только администратор' }, { status: 403 })
  if (s.id === params.id) return NextResponse.json({ error: 'Нельзя удалить себя' }, { status: 400 })
  return NextResponse.json(await deactivateUser(params.id))
}
