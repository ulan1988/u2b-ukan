// «Расчёт» — локальный лист сметы по фирмам/линейкам (тренировочный). Данные одним JSON.
import { db, sqlClient } from '../lib/db'
import { calcSheets } from '../db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

// Сид-пример из Excel «расчет»: водосток, 4 фирмы (Стандарт/Премиум/Люкс/Модерн) + цены.
const SEED = {
  brands: [
    { id: 'b1', name: 'Стандарт', color: '#38761d' },
    { id: 'b2', name: 'Премиум', color: '#1155cc' },
    { id: 'b3', name: 'Люкс', color: '#cc0000' },
    { id: 'b4', name: 'Модерн', color: '#bf9000' },
  ],
  rows: [
    ['Воронка', 1, 2200, 3190, 3980, 800],
    ['Кронштейн', 20, 550, 675, 790, 850],
    ['Кронштейн металл', 0, 1550, 1750, 2950, 0],
    ['Хамут', 3, 980, 1120, 1360, 1300],
    ['Желоб', 4, 2300, 3235, 4390, 2700],
    ['Заглушка', 2, 1010, 1160, 1470, 800],
    ['Колена 72', 2, 1585, 1860, 2520, 1350],
    ['Труба', 1, 3235, 4390, 5750, 3500],
    ['Угол 90', 0, 1970, 2790, 3150, 2800],
    ['Угол 135', 0, 3950, 5520, 7000, 3500],
    ['Соединитель желоб', 3, 1630, 2130, 2635, 0],
    ['Муфта трубы', 0, 1170, 1280, 1870, 0],
    ['Слив', 1, 1690, 1880, 2720, 0],
  ].map((r, i) => ({ id: `r${i + 1}`, name: r[0] as string, qty: r[1] as number, prices: { b1: r[2], b2: r[3], b3: r[4], b4: r[5] } as Record<string, number> })),
}

const safe = (s: any) => { try { const o = JSON.parse(s); return (o && o.brands) ? o : SEED } catch { return SEED } }

// Вкладки листов орг: каждый лист — отдельный расчёт для клиента.
export async function listCalc(orgId: string) {
  return await sqlClient`select id::text, name, updated_at "updatedAt" from calc_sheets where org_id=${orgId} order by created_at, updated_at` as unknown as Array<any>
}

// Лист по id (вкладка) либо последний; если листов нет — создаём из сид-примера.
export async function getCalc(orgId: string, id?: string | null) {
  const rows = id
    ? await sqlClient`select id::text, name, data from calc_sheets where id=${id} and org_id=${orgId} limit 1` as unknown as Array<any>
    : await sqlClient`select id::text, name, data from calc_sheets where org_id=${orgId} order by updated_at desc limit 1` as unknown as Array<any>
  const row = rows[0]
  if (row) return { id: row.id, name: row.name, data: safe(row.data), tabs: await listCalc(orgId) }
  const nid = randomUUID()
  await db.insert(calcSheets).values({ id: nid, orgId, name: 'Расчёт водосток', data: JSON.stringify(SEED) })
  return { id: nid, name: 'Расчёт водосток', data: SEED, tabs: await listCalc(orgId) }
}

// Новая вкладка: тот же набор позиций и фирм (цены — прайс), количества обнулены.
// Так расчёт для следующего клиента начинается с готового прайса, а не с пустого листа.
export async function createCalc(orgId: string, name: string, fromId?: string | null) {
  let base: any = SEED
  if (fromId) {
    const [src] = await sqlClient`select data from calc_sheets where id=${fromId} and org_id=${orgId} limit 1` as unknown as Array<any>
    if (src) base = safe(src.data)
  }
  const data = { brands: base.brands || [], rows: (base.rows || []).map((r: any) => ({ ...r, qty: 0 })) }
  const id = randomUUID()
  await db.insert(calcSheets).values({ id, orgId, name: name || 'Новый расчёт', data: JSON.stringify(data) })
  return { ok: true as const, id, name: name || 'Новый расчёт', data, tabs: await listCalc(orgId) }
}

export async function deleteCalc(orgId: string, id: string) {
  const tabs = await listCalc(orgId)
  if (tabs.length <= 1) return { ok: false as const, error: 'Последнюю вкладку удалить нельзя' }
  await db.delete(calcSheets).where(eq(calcSheets.id, id))
  return { ok: true as const, tabs: await listCalc(orgId) }
}

export async function saveCalc(orgId: string, id: string | null, name: string, data: any) {
  const payload = JSON.stringify(data || {})
  if (id) { await db.update(calcSheets).set({ name: name || 'Расчёт', data: payload, updatedAt: new Date() }).where(eq(calcSheets.id, id)); return { ok: true as const, id } }
  const nid = randomUUID()
  await db.insert(calcSheets).values({ id: nid, orgId, name: name || 'Расчёт', data: payload })
  return { ok: true as const, id: nid }
}
