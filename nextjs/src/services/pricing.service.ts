// Быстрый ввод цены «на ходу»: изделия часто ещё нет в номенклатуре. Сохраняем цену/см
// на БАЗОВОЕ изделие «Изделие {цвет}» (без «NN см») — цена за см одна на вид+цвет.
// Создаём товар, если его нет, и пишем цену в нужное поле по типу клиента (спец/опт/розница).
import { isIzdelie } from '../lib/lineAmount'

const baseName = (n: string) => (n || '').replace(/\s*\d+([.,]\d+)?\s*см\s*$/i, '').trim()
const fieldFor = (pt?: string) => pt === 'spec' ? 'priceSpec' : pt === 'opt' ? 'priceOpt' : 'priceRetail'

export async function setItemPrice(name: string, price: number, priceType?: string) {
  const nm = (name || '').trim()
  if (!nm || !(Number(price) >= 0)) return { ok: false as const, error: 'Имя и цена обязательны' }
  // Для изделия цена/см — на базовое имя; для прочего — на само имя.
  const target = isIzdelie(nm) ? baseName(nm) : nm
  if (!target) return { ok: false as const, error: 'Пустое имя изделия' }

  const { db } = await import('../lib/db')
  const { products } = await import('../db/schema')
  const { sql } = await import('drizzle-orm')
  const field = fieldFor(priceType)

  const [exist] = await db.select({ id: products.id, name: products.name }).from(products)
    .where(sql`lower(trim(${products.name})) = ${target.toLowerCase()}`).limit(1)
  if (exist) {
    await db.update(products).set({ [field]: String(Math.round(Number(price))) } as any).where(sql`${products.id} = ${exist.id}`)
    return { ok: true as const, name: exist.name, field, created: false }
  }
  // Нет товара — создаём базовое изделие в «Комплектующие» (как ensureProduct в producer).
  const [base] = await db.select({ group: products.group, cat: products.cat }).from(products)
    .where(sql`lower(coalesce(${products.group},'')||' '||coalesce(${products.cat},'')) like '%комплект%'`).limit(1)
  const [created] = await db.insert(products).values({
    name: target, unit: 'шт', category: 'goods', group: base?.group || 'Товары', cat: base?.cat || 'Комплектующие',
    [field]: String(Math.round(Number(price))),
  } as any).returning({ id: products.id, name: products.name })
  return { ok: true as const, name: created.name, field, created: true }
}
