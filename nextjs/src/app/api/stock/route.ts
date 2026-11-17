import { NextRequest, NextResponse } from 'next/server'
import { stockByWarehouse } from '@/repositories/document.repo'
import { stockOverview, stockOnDate, applyRevision } from '@/services/warehouse.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/stock?orgId=..&warehouseId=.. → простой остаток [{productId, qty}] (формы прихода/расхода)
// GET /api/stock?orgId=..&overview=1     → экран Склад: [{id,name,unit,cat,qty,reserved}]
// Ревизия на дату: {orgId, date, rows:[{productId, qty}]} — проводим разницу «факт − учёт».
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  if (b?.action !== 'revision') return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  if (!b?.orgId || !/^\d{4}-\d{2}-\d{2}$/.test(String(b?.date || ''))) return NextResponse.json({ error: 'Нужны орг и дата' }, { status: 400 })
  const res: any = await applyRevision(String(b.orgId), String(b.date), Array.isArray(b.rows) ? b.rows : [], s)
  return NextResponse.json(res, { status: res?.ok === false ? 400 : 200 })
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const orgId = p.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  // Остаток на конкретный день (отчёт «Остаток по дням», ревизия).
  const onDate = p.get('onDate')
  if (onDate && /^\d{4}-\d{2}-\d{2}$/.test(onDate)) return NextResponse.json(await stockOnDate(orgId, onDate))
  if (p.get('overview')) {
    const r = await stockOverview(orgId)
    return NextResponse.json(r.items)
  }
  const warehouseId = p.get('warehouseId')
  if (!warehouseId) return NextResponse.json({ error: 'warehouseId обязателен' }, { status: 400 })
  return NextResponse.json(await stockByWarehouse(orgId, warehouseId))
}
