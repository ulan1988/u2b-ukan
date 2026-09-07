import { NextRequest, NextResponse } from 'next/server'
import { updateProductSchema } from '@/dto/catalog.dto'
import { editProduct } from '@/services/catalog.service'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null)
  const parsed = updateProductSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  const orgId = (body && body.orgId) || undefined   // цены продажи — на эту орг
  return NextResponse.json(await editProduct(params.id, parsed.data, orgId))
}
