import { NextRequest, NextResponse } from 'next/server'
import { updateProductSchema } from '@/dto/catalog.dto'
import { editProduct } from '@/services/catalog.service'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = updateProductSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await editProduct(params.id, parsed.data))
}
