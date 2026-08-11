// Справочники: создание, правка, список с архивом (только Drizzle).
import { db } from '../lib/db'
import { products, contragents, warehouses, cashAccounts, units, nomFolders } from '../db/schema'
import { eq, and, asc, sql } from 'drizzle-orm'

// Справочник единиц измерения (глобальный). products.unit хранит текст — правка единиц не ломает товары.
export const listUnits = () => db.select().from(units).where(eq(units.archived, false)).orderBy(asc(units.sortOrder))
export const clearUnits = () => db.delete(units)
export const insertUnits = (vals: typeof units.$inferInsert[]) => vals.length ? db.insert(units).values(vals) : Promise.resolve()

export const createProduct = (v: typeof products.$inferInsert) => db.insert(products).values(v).returning()
export const createContragent = (v: typeof contragents.$inferInsert) => db.insert(contragents).values(v).returning()
export const createWarehouse = (v: typeof warehouses.$inferInsert) => db.insert(warehouses).values(v).returning()
export const createCashAccount = (v: typeof cashAccounts.$inferInsert) => db.insert(cashAccounts).values(v).returning()

export const updateProduct = (id: string, patch: Partial<typeof products.$inferInsert>) =>
  db.update(products).set(patch).where(eq(products.id, id)).returning()
export const updateContragent = (id: string, patch: Partial<typeof contragents.$inferInsert>) =>
  db.update(contragents).set(patch).where(eq(contragents.id, id)).returning()

// Управление справочником — включая архивные (для UI правки).
export const listAllProducts = () => db.select().from(products)
export const listAllContragents = () => db.select().from(contragents)

// ── Папки номенклатуры ─────────────────────────────────────────────────
export const listFolders = () => db.select().from(nomFolders).orderBy(asc(nomFolders.sortOrder))

// Создать папку по пути (grp / grp+cat / grp+cat+sub). Дубли молча игнорируются.
export async function createFolder(grp: string, cat: string, sub: string) {
  grp = (grp || '').trim(); cat = (cat || '').trim(); sub = (sub || '').trim()
  if (!grp) return { ok: false, error: 'Пустое имя группы' }
  if (sub && !cat) return { ok: false, error: 'Нет категории для подгруппы' }
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${nomFolders.sortOrder}),0)` }).from(nomFolders)
  await db.insert(nomFolders).values({ grp, cat, sub, sortOrder: Number(m) + 1 }).onConflictDoNothing()
  return { ok: true }
}

// Переименовать папку — тянет за собой строки-потомки и все товары в ней (без сирот).
export async function renameFolder(grp: string, cat: string, sub: string, name: string) {
  name = (name || '').trim(); if (!name) return { ok: false, error: 'Пустое имя' }
  if (sub) {
    await db.update(nomFolders).set({ sub: name }).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat), eq(nomFolders.sub, sub)))
    await db.update(products).set({ subgroup: name }).where(and(eq(products.cat, cat), eq(products.subgroup, sub)))
  } else if (cat) {
    await db.update(nomFolders).set({ cat: name }).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat)))
    await db.update(products).set({ cat: name }).where(and(eq(products.group, grp), eq(products.cat, cat)))
  } else {
    await db.update(nomFolders).set({ grp: name }).where(eq(nomFolders.grp, grp))
    await db.update(products).set({ group: name }).where(eq(products.group, grp))
  }
  return { ok: true }
}

// Перенести папку в другую (или на верхний уровень). Переписывает пути папок-потомков
// и всех товаров внутри — без сирот. Ограничение дерева: максимум 3 уровня.
export async function moveFolder(src: { grp: string; cat: string; sub: string }, dst: { grp: string; cat: string; sub: string }) {
  const chainOf = (f: { grp: string; cat: string; sub: string }) => [f.grp, f.cat, f.sub].filter(x => x && x.length)
  const pad = (ch: string[]) => ({ grp: ch[0] || '', cat: ch[1] || '', sub: ch[2] || '' })
  const eq3 = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  const starts = (c: string[], p: string[]) => c.length >= p.length && p.every((x, i) => x === c[i])

  const srcCh = chainOf(src)
  const dstCh = dst && dst.grp ? chainOf(dst) : []            // пустой dst = верхний уровень
  if (!srcCh.length) return { ok: false, error: 'Не выбрана папка' }
  if (dstCh.length >= 3) return { ok: false, error: 'Нельзя вложить в подгруппу — максимум 3 уровня' }
  if (starts(dstCh, srcCh)) return { ok: false, error: 'Нельзя вложить папку в саму себя' }

  const newSrcCh = dstCh.concat([srcCh[srcCh.length - 1]])
  if (eq3(newSrcCh, srcCh)) return { ok: true }              // цель = текущий родитель → нечего делать

  const all = await db.select().from(nomFolders)
  const subtree = all.filter(f => starts(chainOf(f), srcCh))
  const maxLen = subtree.length ? Math.max(...subtree.map(f => chainOf(f).length)) : srcCh.length
  if (dstCh.length + maxLen - srcCh.length + 1 > 3) return { ok: false, error: 'Слишком глубоко — максимум 3 уровня' }
  if (all.some(f => eq3(chainOf(f), newSrcCh))) return { ok: false, error: 'В цели уже есть папка с таким именем' }

  // переписать строки папок: удалить старое поддерево, вставить с новыми путями
  for (const f of subtree) await db.delete(nomFolders).where(and(eq(nomFolders.grp, f.grp), eq(nomFolders.cat, f.cat), eq(nomFolders.sub, f.sub)))
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${nomFolders.sortOrder}),0)` }).from(nomFolders)
  let so = Number(m)
  for (const f of subtree) { so++; const nc = dstCh.concat(chainOf(f).slice(srcCh.length - 1)); await db.insert(nomFolders).values({ ...pad(nc), sortOrder: so }).onConflictDoNothing() }

  // переписать товары в поддереве — пакетно по уникальным путям (без сирот)
  const prods = await db.select({ group: products.group, cat: products.cat, subgroup: products.subgroup }).from(products)
  const seen = new Set<string>()
  for (const p of prods) {
    const raw = [p.group || '', p.cat || '', p.subgroup || '']
    const ch = raw.filter(x => x.length)
    if (!starts(ch, srcCh)) continue
    const key = raw.join('|~|'); if (seen.has(key)) continue; seen.add(key)
    const np = pad(dstCh.concat(ch.slice(srcCh.length - 1)))
    await db.update(products).set({ group: np.grp, cat: np.cat, subgroup: np.sub })
      .where(and(eq(products.group, raw[0]), eq(products.cat, raw[1]), eq(products.subgroup, raw[2])))
  }
  return { ok: true }
}

// Удалить папку — только если в ней нет товаров (иначе — сироты). Удаляет и строки-потомки.
export async function deleteFolder(grp: string, cat: string, sub: string) {
  const has = async (w: any) => { const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(products).where(w); return Number(c) > 0 }
  if (sub) {
    if (await has(and(eq(products.cat, cat), eq(products.subgroup, sub)))) return { ok: false, error: 'В папке есть товары — сначала перенесите' }
    await db.delete(nomFolders).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat), eq(nomFolders.sub, sub)))
  } else if (cat) {
    if (await has(and(eq(products.group, grp), eq(products.cat, cat)))) return { ok: false, error: 'В категории есть товары — сначала перенесите' }
    await db.delete(nomFolders).where(and(eq(nomFolders.grp, grp), eq(nomFolders.cat, cat)))
  } else {
    if (await has(eq(products.group, grp))) return { ok: false, error: 'В группе есть товары — сначала перенесите' }
    await db.delete(nomFolders).where(eq(nomFolders.grp, grp))
  }
  return { ok: true }
}
