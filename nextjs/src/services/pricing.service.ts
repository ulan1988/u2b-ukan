// Быстрый ввод цены «на ходу»: изделия часто ещё нет в номенклатуре. Сохраняем цену/см
// на БАЗОВОЕ изделие «Изделие {цвет}» (без «NN см») — цена за см одна на вид+цвет.
// Создаём товар, если его нет, и пишем цену в нужное поле по типу клиента (спец/опт/розница).
import { isIzdelie } from '../lib/lineAmount'

const baseName = (n: string) => (n || '').replace(/\s*\d+([.,]\d+)?\s*см\s*$/i, '').trim()
const fieldFor = (pt?: string) => pt === 'spec' ? 'priceSpec' : pt === 'opt' ? 'priceOpt' : 'priceRetail'

// Цена продажи пишется в product_prices ВЫБРАННОЙ орг (не в шаблон products), чтобы цена одной
// орг не подставлялась другой. Без orgId — старое поведение (в шаблон, для совместимости).
async function upsertOrgPrice(orgId: string, productId: string, field: string, price: number) {
  const { db } = await import('../lib/db')
  const { productPrices } = await import('../db/schema')
  const { and, eq } = await import('drizzle-orm')
  const [ex] = await db.select().from(productPrices).where(and(eq(productPrices.orgId, orgId), eq(productPrices.productId, productId))).limit(1)
  const val = String(Math.round(Number(price)))
  if (ex) await db.update(productPrices).set({ [field]: val } as any).where(eq(productPrices.id, ex.id))
  else await db.insert(productPrices).values({ orgId, productId, priceRetail: '0', priceOpt: '0', priceSpec: '0', [field]: val } as any)
}

// Копирование цен между цветами: подгруппа-источник → подгруппы-получатели той же категории.
// Товары матчатся по ФОРМЕ (имя без RAL-кода цвета), копируются выбранные колонки
// (Приход в products общий; Розн/Опт/Спец в product_prices выбранной орг).
export async function copyColorPrices(
  orgId: string, sourceSub: string, targetSubs: string[],
  cols: { priceIn?: boolean; retail?: boolean; opt?: boolean; spec?: boolean },
) {
  if (!sourceSub || !targetSubs?.length) return { ok: false as const, error: 'Выберите источник и получателей' }
  if (!cols.priceIn && !cols.retail && !cols.opt && !cols.spec) return { ok: false as const, error: 'Выберите колонки цен' }
  const { sqlClient } = await import('../lib/db')
  const { extractRal } = await import('../lib/ral')
  // Ключ формы = имя без токена RAL-кода (чтобы «… 7024 …» совпадало с «… 8017 …»).
  const key = (n: string) => { const r = extractRal(n); return (r ? n.split(/\s+/).filter(t => t !== r).join(' ') : n).replace(/\s+/g, ' ').trim().toLowerCase() }
  const srcRows = await sqlClient`select p.id::text, p.name, p.price_in::float pin,
      coalesce(pp.price_retail,0)::float r, coalesce(pp.price_opt,0)::float o, coalesce(pp.price_spec,0)::float s
    from products p left join product_prices pp on pp.product_id=p.id and pp.org_id=${orgId}
    where p.subgroup=${sourceSub} and coalesce(p.archived,false)=false` as unknown as any[]
  const map = new Map<string, any>(); for (const x of srcRows) map.set(key(x.name), x)
  let updated = 0; const missed: string[] = []
  for (const sub of targetSubs) {
    if (sub === sourceSub) continue
    const tg = await sqlClient`select p.id::text, p.name,
        coalesce(pp.price_retail,0)::float r, coalesce(pp.price_opt,0)::float o, coalesce(pp.price_spec,0)::float s
      from products p left join product_prices pp on pp.product_id=p.id and pp.org_id=${orgId}
      where p.subgroup=${sub} and coalesce(p.archived,false)=false` as unknown as any[]
    for (const t of tg) {
      const s = map.get(key(t.name)); if (!s) { missed.push(`${sub}: ${t.name}`); continue }
      if (cols.priceIn) await sqlClient`update products set price_in=${s.pin} where id=${t.id}`
      if (cols.retail || cols.opt || cols.spec) {
        const nr = cols.retail ? s.r : t.r, no = cols.opt ? s.o : t.o, ns = cols.spec ? s.s : t.s
        await sqlClient`insert into product_prices (org_id, product_id, price_retail, price_opt, price_spec)
          values (${orgId}, ${t.id}, ${nr}, ${no}, ${ns})
          on conflict (org_id, product_id) do update set price_retail=excluded.price_retail, price_opt=excluded.price_opt, price_spec=excluded.price_spec`
      }
      updated++
    }
  }
  return { ok: true as const, updated, missed, missedCount: missed.length }
}

export async function setItemPrice(name: string, price: number, priceType?: string, orgId?: string) {
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
    if (orgId) await upsertOrgPrice(orgId, exist.id, field, price)
    else await db.update(products).set({ [field]: String(Math.round(Number(price))) } as any).where(sql`${products.id} = ${exist.id}`)
    return { ok: true as const, name: exist.name, field, created: false }
  }
  // Нет товара — создаём базовый шаблон в «Комплектующие» (как ensureProduct в producer), цену — на орг.
  const [base] = await db.select({ group: products.group, cat: products.cat }).from(products)
    .where(sql`lower(coalesce(${products.group},'')||' '||coalesce(${products.cat},'')) like '%комплект%'`).limit(1)
  const [created] = await db.insert(products).values({
    name: target, unit: 'шт', category: 'goods', group: base?.group || 'Товары', cat: base?.cat || 'Комплектующие',
    ...(orgId ? {} : { [field]: String(Math.round(Number(price))) }),
  } as any).returning({ id: products.id, name: products.name })
  if (orgId) await upsertOrgPrice(orgId, created.id, field, price)
  return { ok: true as const, name: created.name, field, created: true }
}
