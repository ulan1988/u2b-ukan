// Разовая починка: возврат по чеку ПР-0050 (Кристалл) создал возвратную накладную, но НЕ вернул
// деньги (баг: продажа в долг, оплата «Погашением долга» не учитывалась). Создаём недостающий
// возвратный платёж −8000 с Банковского счёта Кристалла, контрагент Адал Строй 2. Идемпотентно.
import fs from 'fs'
import { randomUUID } from 'crypto'
import { neon } from '@neondatabase/serverless'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/DATABASE_URL\s*=\s*(.+)/)[1].trim().replace(/^['"]|['"]$/g, '').replace(/\r/g, '')
const sql = neon(url)

const KR = '6673fad6-1fc8-4801-8f7a-2f338f766751'            // Магазин Кристалл
const BANK = '592614a2-0870-4c4a-af92-579a1274834f'          // Кристалл · Банковский счет (деньги пришли сюда)
const CAG = 'feaff47e-9da1-41b2-b14a-aac59379bb52'           // контрагент «Адал Строй 2»
const RETDOC = '6ed1cd62-efb4-4ac2-bd09-9e42ce944fe9'        // возвратная накладная ВП-01-ПР-0050
const CARD = 'ПР-0050-241026'
const AMOUNT = 8000
const DATE = '2026-10-24'

const exist = await sql`select count(*)::int n from payments where direction='out' and org_id=${KR} and comment like ${'Возврат ' + CARD + '%'}`
if (exist[0].n > 0) { console.log('⚠ Возврат денег уже есть — ничего не делаю'); process.exit(0) }

await sql`insert into payments (id, org_id, contragent_id, direction, amount, date, cash_account_id, document_id, comment)
  values (${randomUUID()}, ${KR}, ${CAG}, 'out', ${String(AMOUNT)}, ${DATE}, ${BANK}, ${RETDOC}, ${'Возврат ' + CARD})`
console.log(`✓ Возврат денег проведён: −${AMOUNT} ₸ с Банковского счёта Кристалла (чек ${CARD})`)
