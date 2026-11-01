import { neon } from '@neondatabase/serverless'
import { randomUUID } from 'crypto'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/\r/, '')
const sql = neon(url)

const ORG = '50d5113c-06d0-419b-92cf-97a13c4fe94d'          // Нипа листогиб
const WH = '0aea91c9-2381-4dbf-8931-b2f0495107c5'           // Склад производителя (central)
const DATE = '2026-10-31'
const DOC_NUMBER = 'НАЧ-311025'
const DRY = process.argv.includes('--dry')

// ─── ОБЫЧНЫЕ ТОВАРЫ: productId → qty (колорлес профили просуммированы по цветам) ───
const goods = [
  // Комплектующие (КОЛОРЛЕС — один товар, сумма по цветам)
  { id: '8698e70a-1eee-4a2e-ac60-4335a86d0471', qty: 1978, note: 'H - профиль (все цвета)' },
  { id: 'c65e81e0-3c16-4e94-814f-8d055e8f3850', qty: 3708, note: 'J - профиль (все цвета)' },
  { id: 'c9bb3999-844e-4d5d-88e3-bb01eee56593', qty: 665,  note: 'Внут. угол (пр) серый' },
  { id: 'db942e7e-bd3f-40aa-b058-cb56a3dc096b', qty: 2291, note: 'Нар. угол (пр) (все цвета)' },
  { id: 'd7ad4bd6-a324-41b7-83fe-e85f2942780a', qty: 95,   note: 'Нар. угол (сл) беж' },
  // Водосток (per-color, матч по полному имени)
  { id: '782db1ad-1076-435f-83b1-e95a9678cd0c', qty: 99,  note: 'Воронка выпускная 76х102 (ЦВ)' },
  { id: 'c2cb7f02-256a-4a38-a0cf-b7235874e578', qty: 651, note: 'Держатель желоба 7024 120х86х295 (3мм)' },
  { id: 'e75b0716-54f4-4ef2-b2b2-66062cf9a7bc', qty: 466, note: 'Держатель желоба 8017 120х86х295 (3мм)' },
  { id: '5f7915d5-662e-46f8-995c-87b3c4a4f8b9', qty: 523, note: 'Держатель желоба 9003 120х86х295 (3мм)' },
  { id: '68fad9cb-09b5-4280-b524-a67399f520cc', qty: 171, note: 'Держатель трубы 7024 76х102 (на кирпич)' },
  { id: 'c8b0fe98-2299-4c48-a66e-a29484d3f9f1', qty: 117, note: 'Держатель трубы 8017 76х102 (на кирпич)' },
  { id: '98a0d893-5976-4bbd-ada8-212f928891ab', qty: 263, note: 'Держатель трубы 9003 76х102 (на кирпич)' },
  { id: 'f250b39b-9c09-44d3-bdc2-67851a84788e', qty: 50,  note: 'Желоб железный 7024 120х86х3000' },
  { id: 'bae47f6b-e390-4f7a-aad8-81ed5d77d756', qty: 118, note: 'Желоб железный 8017 120х86х3000' },
  { id: 'e98584ba-24f5-4fe2-b71a-6bc979acbe79', qty: 171, note: 'Желоб железный 9003 120х86х3000' },
  { id: 'e4efb4f2-55f1-415c-a28f-03487705ff9c', qty: 197, note: 'Заглушка желоба 7024 120х86 левая' },
  { id: '775a9014-551b-4b55-a071-f8236349bbee', qty: 196, note: 'Заглушка желоба 7024 120х86 правая' },
  { id: 'b9490f45-95bf-4313-94f4-bda85c8ec656', qty: 14,  note: 'Заглушка желоба 8017 120х86 левая' },
  { id: '24149b73-cd25-4786-a8b2-9e0f04ecf0c7', qty: 14,  note: 'Заглушка желоба 8017 120х86 правая' },
  { id: 'e9af1513-509a-4e3b-aca5-b1031aaa7889', qty: 182, note: 'Заглушка желоба 9003 120х86 левая' },
  { id: '080e2372-4b27-4b07-ba51-9edd070d8b38', qty: 179, note: 'Заглушка желоба 9003 120х86 правая' },
  { id: 'e4d2af22-6e14-4b6d-9879-a802eb0a4bc5', qty: 183, note: 'Колено трубы 7024 76х102 (60´)' },
  { id: '4444373c-5cf0-4f40-879d-ef044ff02be4', qty: 79,  note: 'Колено трубы 8017 76х102 (60´)' },
  { id: 'e8f980dd-33db-46be-8163-b08f0c2fa8c9', qty: 125, note: 'Колено трубы 9003 76х102 (60´)' },
  { id: '09880d94-72e1-423b-8dd0-0495f5761796', qty: 69,  note: 'Труба водосточная 7024 76х102х3000' },
  { id: '929f9d63-c971-4b20-8dd2-45161e84b21c', qty: 98,  note: 'Труба водосточная 8017 76х102х3000' },
  { id: '28c231c9-7942-466c-81ef-486c09e3f722', qty: 70,  note: 'Труба водосточная 9003 76х102х3000' },
  { id: 'e28f86b4-9b7d-4122-b3ea-087df663fa1b', qty: 8,   note: 'Угол желоба 7024 120х86 внутренний' },
  { id: 'b42a44e6-fd60-4660-944e-3f3d931e1b3a', qty: 16,  note: 'Угол желоба 7024 120х86 наружный' },
  { id: 'dfd2cd1d-160c-4a7f-9797-970908e024b9', qty: 4,   note: 'Угол желоба 8017 120х86 внутренний' },
  { id: '75e4632a-0eaf-41fb-8a8a-364b9666bc72', qty: 24,  note: 'Угол желоба 8017 120х86 наружный' },
  { id: 'ec62b582-5cc6-43c8-99cf-844531bc1b4c', qty: 31,  note: 'Угол желоба 9003 120х86 внутренний' },
  { id: 'b6f5e09a-d534-4097-bfca-367bdeb73e5d', qty: 32,  note: 'Угол желоба 9003 120х86 наружный' },
]

// ─── ЛИСТЫ → material_pieces ───
const sheets = [
  { prod: '88f0d985-c1a3-4329-b5e3-3e3528d442d2', color: '3D Дуб',        qty: 63 },
  { prod: '113df81b-98fd-4279-a44b-ebc46b2e0a2d', color: '7024 матовый',  qty: 2 },
  { prod: 'a732c0f1-db7f-4da8-8e6f-e63799ac7286', color: '8017 матовый',  qty: 28 },
  { prod: '391053f9-17bd-4a74-bd77-3cdf38c4743b', color: '3020',          qty: 13 },
  { prod: '614aeb8a-4f4a-44b3-8f0a-27ce2a4f3e80', color: '7004',          qty: 75 },
  { prod: '89c319f3-f1a7-4732-962a-3ce2f154a1ee', color: '1015',          qty: 60 },
  { prod: 'e09af63c-cfd1-496a-8259-17f0bc8d3db8', color: '9003',          qty: 218 },
  { prod: '82ac5060-5fd8-40c8-a5b3-02a71d2357c6', color: 'Дуб графит 3D', qty: 2 },
  { prod: '8fe06198-1063-4296-9d36-6036e7144531', color: '2004',          qty: 10 },
  { prod: '2519cf85-0a62-4e17-b840-c16de21707b1', color: 'светлое дерево',qty: 2 },
  { prod: '4bb9b8a1-1f7f-4b48-a5ae-246c09198f6f', color: '7024',          qty: 54 },
  { prod: '0c50b677-13e0-40a1-9738-bba32b5dc5dc', color: '5005',          qty: 33 },
  { prod: 'd75615af-b0eb-4268-b9c5-2ac7d264e82e', color: 'темное дерево', qty: 21 },
  { prod: '21826e43-2245-4c0e-ba47-2f081663dbe7', color: '8017',          qty: 100 },
]

async function main() {
  // анти-дубль
  const existing = await sql`select id from documents where org_id=${ORG} and number=${DOC_NUMBER}`
  if (existing.length) { console.log('УЖЕ ЕСТЬ документ', DOC_NUMBER, '→', existing[0].id, '. Прерываю.'); return }

  // Контрагент «Начальный остаток»
  let [cg] = await sql`select id from contragents where org_id=${ORG} and name='Начальный остаток' limit 1`
  if (!cg) {
    const cgId = randomUUID()
    if (!DRY) await sql`insert into contragents (id, org_id, name, kind) values (${cgId}, ${ORG}, 'Начальный остаток', 'supplier')`
    cg = { id: cgId }
    console.log('СОЗДАН контрагент «Начальный остаток»:', cgId)
  } else console.log('Контрагент «Начальный остаток»:', cg.id)

  // price_in по товарам
  const ids = goods.map(g => g.id)
  const prods = await sql`select id, name, unit, price_in::float pin from products where id = any(${ids})`
  const pById = new Map(prods.map(p => [p.id, p]))

  const docId = randomUUID()
  const lines = [], moves = []
  let total = 0, sort = 0
  for (const g of goods) {
    const p = pById.get(g.id)
    if (!p) { console.log('!! НЕ НАЙДЕН товар', g.id, g.note); continue }
    const price = Number(p.pin) || 0
    const amount = g.qty * price
    total += amount
    lines.push({ id: randomUUID(), documentId: docId, productId: g.id, qty: g.qty, unit: p.unit || 'шт', price, amount, sort: sort++ })
    moves.push({ id: randomUUID(), orgId: ORG, warehouseId: WH, productId: g.id, qty: g.qty, documentId: docId })
  }

  console.log('\n=== ДОКУМЕНТ', DOC_NUMBER, 'id=' + docId, '===')
  console.log('Строк:', lines.length, '| Итого (себестоимость):', total.toLocaleString('ru-RU'), '₸')

  if (!DRY) {
    await sql`insert into documents (id, org_id, type, number, contragent_id, warehouse_id, date, status, total, operation, comment)
      values (${docId}, ${ORG}, 'purchase', ${DOC_NUMBER}, ${cg.id}, ${WH}, ${DATE}, 'posted', ${String(total)}, 'receipt', 'Начальный остаток 31.10.2026 (импорт из Excel)')`
    for (const l of lines)
      await sql`insert into document_lines (id, document_id, product_id, role, qty, unit, price, amount, sort_order)
        values (${l.id}, ${l.documentId}, ${l.productId}, 'main', ${String(l.qty)}, ${l.unit}, ${String(l.price)}, ${String(l.amount)}, ${l.sort})`
    for (const m of moves)
      await sql`insert into stock_movements (id, org_id, warehouse_id, product_id, qty, kind, document_id, date)
        values (${m.id}, ${m.orgId}, ${m.warehouseId}, ${m.productId}, ${String(m.qty)}, 'move', ${m.documentId}, ${DATE})`
    console.log('→ документ + строки + движения проведены.')
  }

  // ЛИСТЫ
  console.log('\n=== ЛИСТЫ → material_pieces ===')
  const mpIds = []
  for (const s of sheets) {
    const id = randomUUID()
    mpIds.push(id)
    if (!DRY) await sql`insert into material_pieces (id, org_id, warehouse_id, product_id, color, width_cm, length_cm, qty, kind)
      values (${id}, ${ORG}, ${WH}, ${s.prod}, ${s.color}, '125', '200', ${s.qty}, 'sheet')`
    console.log(`  ${s.color} ×${s.qty} → ${id}`)
  }

  console.log('\n=== ДЛЯ ОТКАТА ===')
  console.log('DOC_ID=' + docId)
  console.log('MP_IDS=' + mpIds.join(','))
  fs.writeFileSync('_tmp_import/rollback.json', JSON.stringify({ docId, mpIds, cgCreated: cg.id }, null, 1))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
