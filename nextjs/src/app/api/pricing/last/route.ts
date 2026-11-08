import { NextRequest, NextResponse } from 'next/server'
import { sqlClient } from '@/lib/db'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Последняя цена ПРОДАЖИ по товарам орг (из проведённых расходных накладных).
// Нужна «Расчёту»: если в номенклатуре цены нет, берём ту, по которой реально продавали.
// GET ?orgId → { [productId]: price }
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  const rows = await sqlClient`
    select distinct on (dl.product_id) dl.product_id "productId", dl.price::float price, d.date
    from document_lines dl
    join documents d on d.id = dl.document_id
    where d.org_id = ${orgId} and d.type = 'sale' and d.status <> 'cancelled' and dl.product_id is not null and dl.price > 0
    order by dl.product_id, d.date desc, d.created_at desc
  ` as unknown as Array<any>
  const out: Record<string, number> = {}
  for (const r of rows) out[r.productId] = Number(r.price) || 0
  return NextResponse.json(out)
}
