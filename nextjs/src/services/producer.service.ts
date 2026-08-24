// Производственный цикл мастера: «Внести в базу» — изделия карточки становятся товаром
// на складе. Для каждого изделия «Изделие 9003 15 см»: создаём товар в номенклатуре (если
// нет) → проводим производство (выпуск +на склад производителя) → у позиции проставляется
// product_id. После этого карточку можно продать (расходная спишет изделие со склада).
import { randomUUID } from 'crypto'
import * as repo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { createProduction } from './document.service'
import { itemName } from '../lib/itemName'
import type { Session } from '../lib/auth'

const SHEET_WIDTH_CM = 125
const SHEET_LENGTH_CM = 200
const SHEET_AREA_M2 = (SHEET_WIDTH_CM / 100) * (SHEET_LENGTH_CM / 100)   // 2.5 м² в целом листе

// Лист нужного цвета: товар-материал + его последняя цена закупа. Цену ищем сначала в своей
// орг, затем в любой другой (листы закупает головной, а режет филиал — по мосту это один и
// тот же лист). Без второго шага цена почти всегда выходила 0 и себестоимость обнулялась.
type SheetInfo = { productId: string; unit: string; price: number }
async function sheetForColor(orgId: string, color: string): Promise<SheetInfo | null> {
  if (!color) return null
  const { sqlClient } = await import('../lib/db')
  // Декор ищем по словам (дуб/дерев/3D), обычный цвет — по коду РАЛа в названии листа.
  const decor = color === 'дерево'
  const like = decor ? '%' : '%' + color.toLowerCase() + '%'
  const prods = await sqlClient`
    select p.id, p.unit, p.price_in::float price_in
    from products p
    where p.category='material' and p.archived=false
      and lower(p.name) like '%лист%' and lower(p.name) like ${like}
      and lower(p.name) not like '%мат%'
      and (${!decor} or p.name ~* '(дуб|дерев|3d)')
    order by p.created_at desc limit 1` as unknown as Array<{ id: string; unit: string; price_in: number }>
  const prod = prods[0]
  if (!prod) return null
  const own = await sqlClient`
    select dl.price::float price
    from document_lines dl
    join documents d on d.id = dl.document_id and d.type='purchase' and d.status<>'cancelled'
    where dl.product_id=${prod.id} and d.org_id=${orgId}
    order by d.date desc, d.created_at desc limit 1` as unknown as Array<{ price: number }>
  let price = own[0]?.price || 0
  if (!(price > 0)) {
    const any = await sqlClient`
      select dl.price::float price
      from document_lines dl
      join documents d on d.id = dl.document_id and d.type='purchase' and d.status<>'cancelled'
      where dl.product_id=${prod.id}
      order by d.date desc, d.created_at desc limit 1` as unknown as Array<{ price: number }>
    price = any[0]?.price || 0
  }
  if (!(price > 0)) price = Number(prod.price_in) || 0
  return { productId: prod.id, unit: (prod.unit || 'шт').trim(), price }
}

// Цена ЦЕЛОГО листа. Лист может быть заведён в штуках или в м² — приводим к штуке,
// чтобы себестоимость доли считалась одинаково независимо от единицы номенклатуры.
function pricePerSheet(s: SheetInfo) {
  const isArea = /м2|м²|кв/i.test(s.unit)
  return isArea ? s.price * SHEET_AREA_M2 : s.price
}
// Цвет изделия — ТА ЖЕ формула, что в раскрое (material.service.sheetColor): 4-значный РАЛ,
// иначе декор «дерево». Если разойдутся — раскрой спишет лист, а себестоимость выйдет 0.
const ralOf = (name: string) => (name || '').match(/(\d{4})/)?.[1] || (/(дуб|дерев|3d)/i.test(name || '') ? 'дерево' : '')
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
  let targets = positions.filter((p: any) => (p.name1c || p.oral) && Number(p.qty) > 0)
  // Карточку уже проводили (авто-производство на «Готов к доставке»)? Тогда выпускаем только
  // дописанные после этого позиции — у них ещё нет product_id. Иначе выпустили бы всё повторно.
  if (await alreadyProduced(cardId)) targets = targets.filter((p: any) => !p.productId)
  if (!targets.length) return { ok: false as const, error: 'Нет изделий для внесения' }
  const wh = await refsRepo.centralWarehouse(order.orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад производителя' }

  const outputs: any[] = []
  const sheetCache = new Map<string, SheetInfo | null>()
  let created = 0
  for (const p of targets) {
    // Разрыв 6: имя изделия через единую формулу (иначе на складе появлялось безымянное «Изделие»).
    // Нормализуем «вид+цвет+см» из имени позиции + её ширины — товар создаётся с полной идентичностью.
    const raw = (p.name1c || p.oral || '').trim()
    const nm = itemName({ name: raw, color: ralOf(raw), cm: p.widthCm })
    let productId = p.productId as string | null
    if (!productId) {
      productId = await ensureProduct(nm)
      await repo.updatePosition(p.id, { productId })
      created++
    }
    const width = p.widthCm != null ? Number(p.widthCm) : 0
    // Себестоимость изделия = доля листа по ширине: цена_целого_листа(цвет) × ширина / 125.
    const color = ralOf(nm)
    if (!sheetCache.has(color)) sheetCache.set(color, await sheetForColor(order.orgId, color))
    const sheet = sheetCache.get(color) || null
    const cost = sheet && width > 0 ? (pricePerSheet(sheet) * width) / SHEET_WIDTH_CM : 0
    await setProductCost(productId, cost)   // в products.price_in — по нему считается рентабельность
    outputs.push({ productId, qty: Number(p.qty), price: cost || (Number(p.price) || 0), widthCm: width || undefined })
  }

  // Материал списываем раскроем по складу кусков (material_pieces): −целые листы того же РАЛа,
  // остаток ≥4 см → в обрезь. Это уже построенная связка изделие↔лист (consumeForCut/optimizeCut),
  // поэтому в сам документ производства сырьё строками не пишем — иначе расход задвоится.
  let consumed: any = null
  try {
    const { consumeForCut } = await import('./material.service')
    consumed = await consumeForCut(order.orgId, targets)
  } catch { /* нехватка листов не должна ронять выпуск */ }

  const doc = await createProduction({ orgId: order.orgId, warehouseId: wh.id, inputs: [], outputs, comment: `Производство изделий · заявка ${cardId}` } as any)
  const cut = consumed
    ? ` · листов: ${consumed.sheets}, обрезь: ${consumed.remnants}` + (consumed.shortfall ? `, не хватило: ${consumed.shortfall}` : '')
    : ''
  await repo.insertHistory({
    cardId, action: 'produce',
    detail: `Внесено в базу: ${outputs.length} изделий${created ? ` (новых товаров: ${created})` : ''}${cut} · ${doc.number}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true as const, number: doc.number, produced: outputs.length, created, consumed }
}

// Производство уже проводилось по этой карточке? Признак — запись истории action='produce'.
// Без него авто-проведение на «Готов к доставке» выпускало бы изделия повторно при каждом клике.
export async function alreadyProduced(cardId: string): Promise<boolean> {
  const hist = await repo.historyByCard(cardId)
  return hist.some((h: any) => h.action === 'produce')
}
