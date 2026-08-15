import { NextRequest, NextResponse } from 'next/server'
import { editSpecType } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await editSpecType(params.id, b || {}))
}
