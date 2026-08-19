import { NextRequest, NextResponse } from 'next/server'
import { userBySlug } from '@/services/auth.service'
import { adjustSheetLogged } from '@/services/material.service'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Публично: рабочий (по имени) корректирует листы: { color, qty, sign: '+'|'-' }.
// Пишется в журнал (кто/сколько/когда). Индикатор целых листов.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const u = await userBySlug(params.slug)
  if (!u) return NextResponse.json({ error: 'Кабинет не найден' }, { status: 404 })
  const b = await req.json().catch(() => null)
  if (!b?.color || !(Number(b.qty) > 0)) return NextResponse.json({ error: 'Укажите цвет и кол-во' }, { status: 400 })
  if (!(b.name || '').trim()) return NextResponse.json({ error: 'Введите имя' }, { status: 400 })
  const delta = (b.sign === '-' ? -1 : 1) * Math.round(Number(b.qty))
  const res: any = await adjustSheetLogged(u.orgId, b.color, delta, b.name)
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
