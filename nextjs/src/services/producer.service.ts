// Производственный цикл мастера: «Внести в базу» — изделия карточки становятся товаром
// на складе. Для каждого изделия «Изделие 9003 15 см»: создаём товар в номенклатуре (если
// нет) → проводим производство (выпуск +на склад производителя) → у позиции проставляется
// product_id. После этого карточку можно продать (расходная спишет изделие со склада).
import { randomUUID } from 'crypto'
import * as repo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { createProduction } from './document.service'
import type { Session } from '../lib/auth'

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
    let productId = p.productId as string | null
    if (!productId) {
      productId = await ensureProduct((p.name1c || p.oral).trim())
      await repo.updatePosition(p.id, { productId })
      created++
    }
    outputs.push({ productId, qty: Number(p.qty), price: Number(p.price) || 0, widthCm: p.widthCm != null ? Number(p.widthCm) : undefined })
  }
  // Пока БЕЗ списания листа (материал — через кабинет-индикатор). Только выпуск изделия.
  const doc = await createProduction({ orgId: order.orgId, warehouseId: wh.id, inputs: [], outputs, comment: `Производство изделий · заявка ${cardId}` } as any)
  await repo.insertHistory({ cardId, action: 'produce', detail: `Внесено в базу: ${outputs.length} изделий${created ? ` (новых товаров: ${created})` : ''} · ${doc.number}`, userName: actor?.name || 'Система' })
  return { ok: true as const, number: doc.number, produced: outputs.length, created }
}
