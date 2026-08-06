import { NextRequest, NextResponse } from 'next/server'
import { stockByWarehouse } from '@/repositories/document.repo'
import { stockOverview } from '@/services/warehouse.service'

export const dynamic = 'force-dynamic'

// GET /api/stock?orgId=..&warehouseId=.. → простой остаток [{productId, qty}] (формы прихода/расхода)
// GET /api/stock?orgId=..&overview=1     → экран Склад: [{id,name,unit,cat,qty,reserved}]
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const orgId = p.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  if (p.get('overview')) {
    const r = await stockOverview(orgId)
    return NextResponse.json(r.items)
  }
  const warehouseId = p.get('warehouseId')
  if (!warehouseId) return NextResponse.json({ error: 'warehouseId обязателен' }, { status: 400 })
  return NextResponse.json(await stockByWarehouse(orgId, warehouseId))
}
