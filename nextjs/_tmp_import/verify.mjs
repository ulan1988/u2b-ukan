import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const env = fs.readFileSync('.env.local','utf8')
const url = (env.match(/DATABASE_URL=(.+)/)||[])[1].trim().replace(/\r/,'')
const sql = neon(url)
const ORG='50d5113c-06d0-419b-92cf-97a13c4fe94d', WH='0aea91c9-2381-4dbf-8931-b2f0495107c5'
// Остатки склада Нипы (сумма движений)
const st = await sql`select p.name, sum(m.qty)::float q, p.unit from stock_movements m join products p on p.id=m.product_id
  where m.org_id=${ORG} and m.warehouse_id=${WH} and m.kind='move' group by p.name, p.unit having sum(m.qty)<>0 order by p.name`
console.log('=== ОСТАТКИ СКЛАДА НИПЫ (всего строк:', st.length, ') ===')
for (const r of st) console.log(`  ${r.q}\t${r.unit}\t${r.name}`)
// Листы Нипы
console.log('\n=== ЛИСТЫ (sheet) НИПЫ ===')
const sh = await sql`select color, qty, product_id from material_pieces where org_id=${ORG} and kind='sheet' order by color`
let tot=0
for (const r of sh){ tot+=Number(r.qty); console.log(`  ${r.color}\t×${r.qty}`) }
console.log('  ИТОГО листов:', tot)
// Документ
const [d]=await sql`select number, type, status, total::float, date, (select count(*) from document_lines where document_id=documents.id) lines from documents where id='515411a5-e769-4a0e-8f71-3069ffcad55e'`
console.log('\n=== ДОКУМЕНТ ===', JSON.stringify(d))
