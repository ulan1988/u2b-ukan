import { NextRequest, NextResponse } from 'next/server'
import { createPaymentSchema } from '@/dto/payment.dto'
import { createPayment, listPayments } from '@/services/payment.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listPayments(orgId))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = createPaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await createPayment(parsed.data), { status: 201 })
}
