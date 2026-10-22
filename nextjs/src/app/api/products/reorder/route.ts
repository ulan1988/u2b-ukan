import { NextRequest, NextResponse } from 'next/server'
import { reorderProducts } from '@/services/catalog.service'

export const dynamic = 'force-dynamic'

// Сохранить порядок товаров (перетаскивание в номенклатуре): { items: [{id, sortOrder}] }.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items : []
  const res = await reorderProducts(items)
  return NextResponse.json(res)
}
