import { NextRequest, NextResponse } from 'next/server'
import { materialStock, addSheets } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// GET — склад материала (куски: листы/обрезь). POST — приход листов.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  return NextResponse.json(await materialStock(orgId))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.color && !b?.productId) return NextResponse.json({ error: 'Укажите цвет или лист' }, { status: 400 })
  const res: any = await addSheets(b.orgId || s.orgId, b)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
