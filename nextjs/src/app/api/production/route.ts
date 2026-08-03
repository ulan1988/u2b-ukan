import { NextRequest, NextResponse } from 'next/server'
import { createProductionSchema } from '@/dto/production.dto'
import { createProduction, listProduction } from '@/services/document.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listProduction(orgId))
}

export async function POST(req: NextRequest) {
  const parsed = createProductionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await createProduction(parsed.data), { status: 201 })
}
