// Производственный цикл мастера: «Внести в базу» — изделия карточки становятся товаром
// на складе. Для каждого изделия «Изделие 9003 15 см»: создаём товар в номенклатуре (если
// нет) → проводим производство (выпуск +на склад производителя) → у позиции проставляется
// product_id. После этого карточку можно продать (расходная спишет изделие со склада).
import { randomUUID } from 'crypto'
import * as repo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { createProduction } from './document.service'
import type { Session } from '../lib/auth'

const SHEET_WIDTH_CM = 125

// Цена листа нужного цвета = последняя цена закупа (из приходных накладных листов, глянец).
// Себестоимость изделия = доля листа = цена_листа × ширина_изделия / 125.
async function sheetPriceForColor(orgId: string, color: string): Promise<number> {
  if (!color) return 0
  const { sqlClient } = await import('../lib/db')
  const rows = await sqlClient`
    select dl.price::float price
    from document_lines dl
    join documents d on d.id = dl.document_id and d.type='purchase' and d.status<>'cancelled'
    join products p on p.id = dl.product_id and p.category='material'
    where d.org_id=${orgId}
      and lower(p.name) like '%лист%' and lower(p.name) like ${'%' + color.toLowerCase() + '%'}
      and lower(p.name) not like '%мат%'
    order by d.date desc, d.created_at desc limit 1` as unknown as Array<{ price: number }>
  return rows[0]?.price || 0
}
const ralOf = (name: string) => { const m = (name || '').match(/(^|\D)(\d{4})(\D|$)/); return m ? m[2] : '' }
async function setProductCost(productId: string, cost: number) {
  if (!(cost > 0)) return
  const { db } = await import('../lib/db')
  const { products } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  await db.update(products).set({ priceIn: String(Math.round(cost)) }).where(eq(products.id, productId))
}

// Найти/создать товар по имени (goods, папка «Комплектующие»). Имя = идентичность изделия
// (напр. «Изделие 9003 15 см») — по нему считается рентабельность конкретного товара.
async function ensureProduct(name: string): Promise<string> {
  const { db } = await import('../lib/db')
  const { products } = await import('../db/schema')
  const { sql } = await import('drizzle-orm')
  const nm = name.trim()
  const [exist] = await db.select({ id: products.id }).from(products)
    .where(sql`lower(trim(${products.name})) = ${nm.toLowerCase()}`).limit(1)
  if (exist) return exist.id
  // дерево берём от любого базового товара «Комплектующие», чтобы новый товар лёг туда же
  const [base] = await db.select({ group: products.group, cat: products.cat }).from(products)
    .where(sql`lower(coalesce(${products.group},'')||' '||coalesce(${products.cat},'')) like '%комплект%'`).limit(1)
  const id = randomUUID()
  await db.insert(products).values({ id, name: nm, unit: 'шт', category: 'goods', group: base?.group || 'Товары', cat: base?.cat || 'Комплектующие' })
  return id
}

// Внести изделия карточки в базу: создать товары + провести производство (выпуск на склад).
export async function produceToBase(cardId: string, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  const positions = await repo.positionsByCard(cardId)
  const targets = positions.filter((p: any) => (p.name1c || p.oral) && Number(p.qty) > 0)
  if (!targets.length) return { ok: false as const, error: 'Нет изделий для внесения' }
  const wh = await refsRepo.centralWarehouse(order.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад производителя' }

  const outputs: any[] = []
  let created = 0
  for (const p of targets) {
    const nm = (p.name1c || p.oral).trim()
    let productId = p.productId as string | null
    if (!productId) {
      productId = await ensureProduct(nm)
      await repo.updatePosition(p.id, { productId })
      created++
    }
    // Себестоимость = доля листа: цена_листа(цвет) × ширина / 125.
    const width = p.widthCm != null ? Number(p.widthCm) : 0
    const sheetPrice = await sheetPriceForColor(order.orgId, ralOf(nm))
    const cost = width > 0 && sheetPrice > 0 ? (sheetPrice * width) / SHEET_WIDTH_CM : 0
    await setProductCost(productId, cost)   // в products.price_in — по нему считается рентабельность
    outputs.push({ productId, qty: Number(p.qty), price: cost || (Number(p.price) || 0), widthCm: width || undefined })
  }
  // Пока БЕЗ списания листа (материал — через кабинет-индикатор). Только выпуск изделия.
  const doc = await createProduction({ orgId: order.orgId, warehouseId: wh.id, inputs: [], outputs, comment: `Производство изделий · заявка ${cardId}` } as any)
  await repo.insertHistory({ cardId, action: 'produce', detail: `Внесено в базу: ${outputs.length} изделий${created ? ` (новых товаров: ${created})` : ''} · ${doc.number}`, userName: actor?.name || 'Система' })
  return { ok: true as const, number: doc.number, produced: outputs.length, created }
}
