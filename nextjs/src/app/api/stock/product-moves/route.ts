import { NextRequest, NextResponse } from 'next/server'
import { productMovements } from '@/repositories/document.repo'

export const dynamic = 'force-dynamic'

// Движение одного товара по всем накладным (для У-Канбан → «Движение товара»).
export async function GET(req: NextRequest) {
  const u = new URL(req.url)
  const orgId = u.searchParams.get('orgId'); const productId = u.searchParams.get('productId')
  if (!orgId || !productId) return NextResponse.json([])
  return NextResponse.json(await productMovements(orgId, productId))
}
