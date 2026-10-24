// Разовый догон: инкассировать накопленный «Банковский счёт» (QR) Магазина Кристалл головному
// ПО ДНЯМ (копия syncSellerBankToHq). Идемпотентно: remain = gross − уже инкассировано.
import fs from 'fs'
import { randomUUID } from 'crypto'
import { neon } from '@neondatabase/serverless'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/DATABASE_URL\s*=\s*(.+)/)[1].trim().replace(/^['"]|['"]$/g, '').replace(/\r/g, '')
const sql = neon(url)

const KR = '6673fad6-1fc8-4801-8f7a-2f338f766751'            // Магазин Кристалл
const HQ = 'e015c65a-1574-4b36-85d8-0f9ac6e75484'            // Адал Строй 2 (hq)
const BANK = '592614a2-0870-4c4a-af92-579a1274834f'          // Кристалл · Банковский счет
const HEAD_BRIDGE = 'feaff47e-9da1-41b2-b14a-aac59379bb52'   // в книге Кристалла → Адал Строй 2
const FILIAL_BRIDGE = 'd9eeb703-5a88-44dc-891d-a6fecbc7a48c' // в книге ГО → Магазин Кристалл
const QR_KR = '0469c26f-370b-4f69-b223-ac409e58f503'         // ГО · QR Кристалл

const rows = await sql`select date::text d,
  coalesce(sum(case when (comment is null or comment not like 'Инкассация%') then (case when direction='in' then amount else -amount end) else 0 end),0)::float gross,
  coalesce(sum(case when comment like 'Инкассация → головной%' and direction='out' then amount else 0 end),0)::float enc
  from payments where cash_account_id=${BANK} group by date order by date`

for (const r of rows) {
  const remain = Math.round(((Number(r.gross) || 0) - (Number(r.enc) || 0)) * 100) / 100
  if (remain <= 0) continue
  await sql`insert into payments (id, org_id, contragent_id, direction, amount, date, cash_account_id, document_id, comment)
    values (${randomUUID()}, ${KR}, ${HEAD_BRIDGE}, 'out', ${String(remain)}, ${r.d}, ${BANK}, null, 'Инкассация → головной (QR Кристалл)')`
  await sql`insert into payments (id, org_id, contragent_id, direction, amount, date, cash_account_id, document_id, comment)
    values (${randomUUID()}, ${HQ}, ${FILIAL_BRIDGE}, 'in', ${String(remain)}, ${r.d}, ${QR_KR}, null, 'Инкассация от Магазин Кристалл · банк')`
  console.log(`✓ ${r.d}: инкассировано ${remain} ₸ → головному (QR Кристалл)`)
}
console.log('Готово.')
