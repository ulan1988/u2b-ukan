import { NextRequest, NextResponse } from 'next/server'
import { bulkSetPrices } from '@/services/catalog.service'

export const dynamic = 'force-dynamic'

// Массовая установка цен на список товаров: { ids[], orgId?, priceIn?, priceRetail?, priceOpt?, priceSpec? }.
// Цены продажи → product_prices выбранной орг; приход → общий шаблон. Пустые поля не трогаем.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  if (!b || !Array.isArray(b.ids) || !b.ids.length) return NextResponse.json({ error: 'Нет товаров' }, { status: 400 })
  const fields: any = {}
  for (const k of ['priceIn', 'priceRetail', 'priceOpt', 'priceSpec']) if (b[k] !== undefined && b[k] !== null && b[k] !== '') fields[k] = Number(b[k])
  if (!Object.keys(fields).length) return NextResponse.json({ error: 'Не задана ни одна цена' }, { status: 400 })
  const res = await bulkSetPrices(b.ids, fields, b.orgId || undefined)
  if (!res.ok) return NextResponse.json(res, { status: 400 })
  return NextResponse.json(res)
}
