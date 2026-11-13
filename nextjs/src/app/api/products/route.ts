import { NextRequest, NextResponse } from 'next/server'
import { createProductSchema } from '@/dto/catalog.dto'
import { addProduct } from '@/services/catalog.service'
import { listProducts } from '@/repositories/refs.repo'
import { listAllProducts } from '@/repositories/catalog.repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const all = sp.get('all')
  const orgId = sp.get('orgId') || undefined   // цены продажи этой орг (иначе шаблон без цен)
  // template=1 — экран «Номенклатура»: общая номенклатура = ТОЛЬКО ШАБЛОН, без собранных
  // вариантов (база + цвет/см). Каталоги выбора товара ходят без этого флага и видят всё.
  const tpl = sp.get('template') === '1'
  return NextResponse.json(all ? await listAllProducts(orgId, tpl) : await listProducts(orgId, tpl))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = createProductSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  const orgId = (body && body.orgId) || undefined   // цены продажи — на эту орг
  return NextResponse.json(await addProduct(parsed.data, orgId), { status: 201 })
}
