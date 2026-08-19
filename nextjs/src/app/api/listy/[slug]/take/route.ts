import { NextRequest, NextResponse } from 'next/server'
import { userBySlug } from '@/services/auth.service'
import { takeSheetsLogged } from '@/services/material.service'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Публично: рабочий (по имени) вносит «взял N листов цвета». Пишется в журнал (кто).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const u = await userBySlug(params.slug)
  if (!u) return NextResponse.json({ error: 'Кабинет не найден' }, { status: 404 })
  const b = await req.json().catch(() => null)
  if (!b?.color || !(Number(b.qty) > 0)) return NextResponse.json({ error: 'Укажите цвет и кол-во' }, { status: 400 })
  if (!(b.name || '').trim()) return NextResponse.json({ error: 'Введите имя' }, { status: 400 })
  const res: any = await takeSheetsLogged(u.orgId, b.color, Number(b.qty), b.name)
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
