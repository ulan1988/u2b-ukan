import { NextRequest, NextResponse } from 'next/server'
import { createSaleSchema } from '@/dto/document.dto'
import { createReturn, listReturns } from '@/services/document.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listReturns(orgId))
}

// POST /api/returns?kind=in|out
export async function POST(req: NextRequest) {
  const kindParam = new URL(req.url).searchParams.get('kind')
  const kind = kindParam === 'out' ? 'return_out' : 'return_in'
  const parsed = createSaleSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await createReturn(parsed.data, kind), { status: 201 })
}
