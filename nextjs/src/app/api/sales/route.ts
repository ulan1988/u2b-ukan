import { NextRequest, NextResponse } from 'next/server'
import { createSaleSchema } from '@/dto/document.dto'
import { createSale, listSales } from '@/services/document.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listSales(orgId))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = createSaleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  }
  const created = await createSale(parsed.data)
  return NextResponse.json(created, { status: 201 })
}
