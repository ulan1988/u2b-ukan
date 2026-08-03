import { NextRequest, NextResponse } from 'next/server'
import { createWarehouseSchema } from '@/dto/catalog.dto'
import { addWarehouse } from '@/services/catalog.service'
import { listWarehouses } from '@/repositories/refs.repo'

export const dynamic = 'force-dynamic'

export async function GET() { return NextResponse.json(await listWarehouses()) }

export async function POST(req: NextRequest) {
  const parsed = createWarehouseSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await addWarehouse(parsed.data), { status: 201 })
}
