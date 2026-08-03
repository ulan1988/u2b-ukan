import { NextRequest, NextResponse } from 'next/server'
import { createCashAccountSchema } from '@/dto/catalog.dto'
import { addCashAccount } from '@/services/catalog.service'
import { listCashAccounts } from '@/repositories/refs.repo'

export const dynamic = 'force-dynamic'

export async function GET() { return NextResponse.json(await listCashAccounts()) }

export async function POST(req: NextRequest) {
  const parsed = createCashAccountSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await addCashAccount(parsed.data), { status: 201 })
}
