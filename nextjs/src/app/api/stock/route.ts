import { NextRequest, NextResponse } from 'next/server'
import { stockByWarehouse } from '@/repositories/document.repo'

export const dynamic = 'force-dynamic'

// Остаток склада: GET /api/stock?orgId=..&warehouseId=.. → [{ productId, qty }]
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const orgId = p.get('orgId'); const warehouseId = p.get('warehouseId')
  if (!orgId || !warehouseId) return NextResponse.json({ error: 'orgId и warehouseId обязательны' }, { status: 400 })
  return NextResponse.json(await stockByWarehouse(orgId, warehouseId))
}
