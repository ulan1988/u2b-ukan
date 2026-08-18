import { NextRequest, NextResponse } from 'next/server'
import { takeSheets } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Мастер взял листы: { color, qty } → списание целых листов (глянец, FIFO).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.color || !(Number(b.qty) > 0)) return NextResponse.json({ error: 'Укажите цвет и кол-во' }, { status: 400 })
  const res: any = await takeSheets(b.orgId || s.orgId, b.color, Number(b.qty))
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
