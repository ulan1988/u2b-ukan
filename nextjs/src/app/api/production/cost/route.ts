// Себестоимость 1 см листа у организации-производителя: читать и задавать.
import { NextRequest, NextResponse } from 'next/server'
import { costPerCmSchema } from '@/dto/production.dto'
import { getCostPerCm, saveCostPerCm } from '@/services/producer.service'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await getSession()
  const orgId = new URL(req.url).searchParams.get('orgId') || s?.orgId
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  const { prodSettings } = await import('@/db/schema')
  const { db } = await import('@/lib/db')
  const { eq } = await import('drizzle-orm')
  const [row] = await db.select().from(prodSettings).where(eq(prodSettings.orgId, orgId)).limit(1)
  return NextResponse.json({
    costPerCm: Number(row?.costPerCm) || 0,
    sheetPrice: Number(row?.sheetPrice) || 0,
    updatedAt: row?.updatedAt || null,
  })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'Нет сессии' }, { status: 401 })
  const parsed = costPerCmSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля' }, { status: 400 })
  const orgId = parsed.data.orgId || s.orgId
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  const r = await saveCostPerCm(orgId, parsed.data)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
