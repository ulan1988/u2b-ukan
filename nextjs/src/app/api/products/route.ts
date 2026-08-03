import { NextRequest, NextResponse } from 'next/server'
import { createProductSchema } from '@/dto/catalog.dto'
import { addProduct } from '@/services/catalog.service'
import { listProducts } from '@/repositories/refs.repo'
import { listAllProducts } from '@/repositories/catalog.repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const all = new URL(req.url).searchParams.get('all')
  return NextResponse.json(all ? await listAllProducts() : await listProducts())
}

export async function POST(req: NextRequest) {
  const parsed = createProductSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await addProduct(parsed.data), { status: 201 })
}
