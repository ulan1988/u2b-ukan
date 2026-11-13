// Производственный цикл мастера: «Внести в базу» — изделия карточки становятся товаром
// на складе. Для каждого изделия «Изделие 9003 15 см»: создаём товар в номенклатуре (если
// нет) → проводим производство (выпуск +на склад производителя) → у позиции проставляется
// product_id. После этого карточку можно продать (расходная спишет изделие со склада).
import { randomUUID } from 'crypto'
import * as repo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import * as prodSettingsRepo from '../repositories/prodSettings.repo'
import { createProduction } from './document.service'
import { itemName } from '../lib/itemName'
import { isIzdelie } from '../lib/lineAmount'
import type { Session } from '../lib/auth'

const SHEET_WIDTH_CM = 125
const SHEET_LENGTH_CM = 200
const SHEET_AREA_M2 = (SHEET_WIDTH_CM / 100) * (SHEET_LENGTH_CM / 100)   // 2.5 м² в целом листе

// Себестоимость сантиметра — ОДНО число на организацию (цвет на цену закупа не влияет,
// решение владельца 09.11.2026). Лист 125 см: цена листа ÷ 125, либо цена м² ÷ 50.
// Себестоимость изделия = ширина_см × costPerCm — делить на 125 ещё раз НЕЛЬЗЯ.
export async function getCostPerCm(orgId: string): Promise<number> {
  const row = await prodSettingsRepo.get(orgId)
  return Number(row?.costPerCm) || 0
}

// Сохранить себестоимость: владелец вводит цену ЛИСТА (1,25×2 м) либо цену за м² — считаем ₸/см.
export async function saveCostPerCm(orgId: string, i: { sheetPrice?: number; m2Price?: number; perCm?: number }) {
  let perCm = Number(i.perCm) || 0
  let sheetPrice = Number(i.sheetPrice) || 0
  if (!sheetPrice && Number(i.m2Price) > 0) sheetPrice = Number(i.m2Price) * SHEET_AREA_M2
  if (sheetPrice > 0) perCm = sheetPrice / SHEET_WIDTH_CM
  else if (perCm > 0) sheetPrice = perCm * SHEET_WIDTH_CM
  if (!(perCm > 0)) return { ok: false as const, error: 'Укажите цену листа или цену за м²' }
  const row = await prodSettingsRepo.save(orgId, { costPerCm: Math.round(perCm * 10000) / 10000, sheetPrice: Math.round(sheetPrice * 100) / 100 })
  return { ok: true as const, costPerCm: Number(row.costPerCm), sheetPrice: Number(row.sheetPrice) }
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
export async function ensureProduct(name: string, orgId?: string): Promise<string> {
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
  // Владелец: завёл филиал — товар остаётся у него, завёл головной — общий.
  const { ownerOrgFor } = await import('../repositories/refs.repo')
  // variant: собранный товар (база + цвет/см) — не шаблон, в общей номенклатуре не показывается.
  const isVariant = /[0-9]+s*см$/i.test(nm)
  await db.insert(products).values({ id, name: nm, unit: 'шт', category: 'goods', group: base?.group || 'Товары', cat: base?.cat || 'Комплектующие', variant: isVariant, ownerOrgId: await ownerOrgFor(orgId) } as any)
  return id
}

// Внести изделия карточки в базу: создать товары + провести производство (выпуск на склад).
// date — рабочая дата документа производства (проведение задним числом); пусто → today().
export async function produceToBase(cardId: string, actor?: Session | null, date?: string) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  const positions = await repo.positionsByCard(cardId)
  let targets = positions.filter((p: any) => (p.name1c || p.oral) && Number(p.qty) > 0)
  // Чужие позиции карточки НЕ производим: в карточке головного рядом могут стоять позиции
  // стороннего поставщика (их везёт логист). Производим только своё — без поставщика
  // (прямой заказ мастера) или с поставщиком-филиалом (leg=1).
  {
    const { legForSuppliers } = await import('../lib/legDetect')
    const legMap = await legForSuppliers(targets.map((p: any) => p.supplierId))
    targets = targets.filter((p: any) => !p.supplierId || legMap[p.supplierId] === 1)
  }
  // Карточку уже проводили (авто-производство на «Готов к доставке»)? Тогда выпускаем только
  // дописанные после этого позиции — у них ещё нет product_id. Иначе выпустили бы всё повторно.
  if (await alreadyProduced(cardId)) targets = targets.filter((p: any) => !p.productId)
  if (!targets.length) return { ok: false as const, error: 'Нет изделий для внесения' }
  // Производящий склад — филиала-ПОСТАВЩИКА позиций (leg=1), а НЕ орг-владельца карточки.
  // Закуп головного (order.orgId=головной) с поставщиком-филиалом: выпуск должен идти на склад
  // ФИЛИАЛА, потому что зеркальная расходная списывает именно склад филиала. Иначе выпуск падал
  // на Центр-Склад головного, а филиал уходил в минус (двойной приход у головного).
  const prodOrgId = await producingOrg(targets, order.orgId)
  const wh = await refsRepo.centralWarehouse(prodOrgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад производителя' }

  const outputs: any[] = []
  const made: any[] = []          // позиции, реально выпущенные (для раскроя)
  const perCm = await getCostPerCm(prodOrgId)   // ₸ за 1 см листа — одно число на орг
  let created = 0, skipped = 0
  for (const p of targets) {
    const raw = (p.name1c || p.oral || '').trim()
    const nm = itemName({ name: raw, color: ralOf(raw), cm: p.widthCm })
    const izd = isIzdelie(nm)
    const hasCm = Number(p.widthCm) > 0 || /\d+\s*см/i.test(nm)
    // Изделие требует РАЛ и см (иначе лист не выбрать) — без них пропускаем.
    if (izd && (!ralOf(nm) || !hasCm)) { skipped++; continue }
    const width = p.widthCm != null ? Number(p.widthCm) : 0
    // Себестоимость = доля листа по ширине: цена_целого_листа(цвет) × ширина / 125.
    const color = ralOf(nm)
    // Себестоимость = ширина изделия в см × цена 1 см (лист 125 см уже учтён в ставке).
    const cost = width > 0 ? Math.round(perCm * width * 100) / 100 : 0

    // ИЗДЕЛИЕ — СВОЙ товар по цвету и см («Изделие {РАЛ} {см} см»): изделие без цвета на складе
    // запрещено, остаток обязан считаться по цветам. Голые (без РАЛ/см) отсеяны выше.
    let productId = p.productId as string | null
    if (izd) {
      productId = await ensureProduct(nm, prodOrgId)
    } else if (!productId) {
      productId = await ensureProduct(nm, prodOrgId)
      created++
    }
    const patch: any = {}
    if (productId !== p.productId) patch.productId = productId
    if (cost > 0) patch.costPrice = String(Math.round(cost))   // себестоимость строки (доля листа)
    if (Object.keys(patch).length) await repo.updatePosition(p.id, patch)
    await setProductCost(productId as string, cost)   // себестоимость в price_in товара (у изделий — доля листа)

    outputs.push({ productId, qty: Number(p.qty), price: cost || (Number(p.price) || 0), widthCm: width || undefined })
    made.push(p)
  }
  if (!outputs.length) return { ok: false as const, error: skipped ? 'Изделие без цвета или длины — укажите РАЛ и см, тогда выпустится товар «Изделие {цвет} {см} см»' : 'Нет изделий для внесения', skipped }

  // Материал списываем раскроем по складу кусков (material_pieces): −целые листы того же РАЛа,
  // остаток ≥4 см → в обрезь. Это уже построенная связка изделие↔лист (consumeForCut/optimizeCut),
  // поэтому в сам документ производства сырьё строками не пишем — иначе расход задвоится.
  let consumed: any = null
  try {
    const { consumeForCut } = await import('./material.service')
    consumed = await consumeForCut(order.orgId, made)
  } catch { /* нехватка листов не должна ронять выпуск */ }

  const doc = await createProduction({ orgId: order.orgId, warehouseId: wh.id, inputs: [], outputs, date: date || undefined, comment: `Производство изделий · заявка ${cardId}` } as any)
  const cut = consumed
    ? ` · листов: ${consumed.sheets}, обрезь: ${consumed.remnants}` + (consumed.shortfall ? `, не хватило: ${consumed.shortfall}` : '')
    : ''
  await repo.insertHistory({
    cardId, action: 'produce',
    detail: `Внесено в базу: ${outputs.length} изделий${created ? ` (новых товаров: ${created})` : ''}${skipped ? ` · без цвета пропущено: ${skipped}` : ''}${cut} · ${doc.number}`,
    userName: actor?.name || 'Система',
  })
  return { ok: true as const, number: doc.number, produced: outputs.length, created, skipped, consumed }
}

// Производство НА ЗАПАС (без карточки, без покупателя, без оплаты): мастер указывает что и
// сколько сделано → выпуск прямо на склад Нипы. Материал списывается раскроем. В Кассе дня
// попадает в «производство в запас» (docs type='production' output). Себестоимость — доля листа.
export async function produceToStock(orgId: string, items: { name?: string; color?: string; cm?: number | string; qty: number | string; productId?: string | null }[], actor?: Session | null) {
  const wh = await refsRepo.centralWarehouse(orgId)
  if (!wh) return { ok: false as const, error: 'Не найден склад производителя' }
  const outputs: any[] = []
  const made: any[] = []
  const perCm = await getCostPerCm(orgId)       // ₸ за 1 см листа — одно число на орг
  let created = 0, skipped = 0
  for (const it of items) {
    const qty = Number(it.qty) || 0
    if (qty <= 0 || !((it.name || '').trim() || it.productId)) continue
    const nm = itemName({ name: it.name || 'Изделие', color: it.color, cm: it.cm })
    const izd = isIzdelie(nm)
    const color = ralOf(nm) || (it.color === 'decor' ? 'дерево' : (it.color || ''))
    const width = Number(it.cm) || 0
    // Изделие требует РАЛ и см — иначе лист не выбрать.
    if (izd && (!color || !(width > 0))) { skipped++; continue }
    // Себестоимость = ширина изделия в см × цена 1 см (лист 125 см уже учтён в ставке).
    const cost = width > 0 ? Math.round(perCm * width * 100) / 100 : 0
    let productId = it.productId || null
    if (izd) productId = await ensureProduct(nm, orgId)   // «Изделие {РАЛ} {см} см» — без цвета на склад нельзя
    else if (!productId) { productId = await ensureProduct(nm, orgId); created++ }
    if (productId) await setProductCost(productId, cost)
    outputs.push({ productId, qty, price: cost || 0, widthCm: width || undefined, comment: nm })
    made.push({ name1c: nm, oral: nm, widthCm: width, qty, productId })
  }
  if (!outputs.length) return { ok: false as const, error: skipped ? 'Изделие без цвета/длины — укажите РАЛ и см' : 'Нет позиций для выпуска', skipped }
  let consumed: any = null
  try { const { consumeForCut } = await import('./material.service'); consumed = await consumeForCut(orgId, made) } catch { /* нехватка листов не роняет выпуск */ }
  const doc = await createProduction({ orgId, warehouseId: wh.id, inputs: [], outputs, comment: 'Производство на запас (склад)' } as any)
  return { ok: true as const, number: doc.number, produced: outputs.length, created, skipped, consumed }
}

// Орг, чей склад производит: если у позиций есть поставщик-филиал, берём орг этого филиала.
// Иначе — орг-владелец карточки. Идентичность филиала — через legDetect (мост org_ref_id /
// кабинет / имя): раньше искали только users.role='branch', а кабинеты филиалов заведены
// как role='admin' — из-за этого выпуск Нипы падал на Центр-Склад головного.
async function producingOrg(positions: any[], fallbackOrgId: string): Promise<string> {
  const supIds = Array.from(new Set(positions.map((p: any) => p.supplierId).filter(Boolean))) as string[]
  if (!supIds.length) return fallbackOrgId
  const { branchOrgForSuppliers } = await import('../lib/legDetect')
  const map = await branchOrgForSuppliers(supIds)
  for (const id of supIds) if (map[id]) return map[id]
  return fallbackOrgId
}

// Производство уже проводилось по этой карточке? Признак — запись истории action='produce'.
// Без него авто-проведение на «Готов к доставке» выпускало бы изделия повторно при каждом клике.
export async function alreadyProduced(cardId: string): Promise<boolean> {
  const hist = await repo.historyByCard(cardId)
  return hist.some((h: any) => h.action === 'produce')
}
