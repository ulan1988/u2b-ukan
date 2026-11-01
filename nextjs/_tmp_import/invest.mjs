import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const env = fs.readFileSync('.env.local','utf8')
const url = (env.match(/DATABASE_URL=(.+)/)||[])[1].trim().replace(/\r/,'')
const sql = neon(url)
const ORG='50d5113c-06d0-419b-92cf-97a13c4fe94d', WH='0aea91c9-2381-4dbf-8931-b2f0495107c5', DOC='515411a5-e769-4a0e-8f71-3069ffcad55e'
// Per-color profile products: archived?
const prof = await sql`select id, name, archived, category, "group",cat,subgroup from products where (name ilike 'H - профиль %' or name ilike 'J - профиль %' or name ilike '%угол (пр) %' or name ilike '%угол (сл) %' or name ilike '%угол (пр) дерево%') order by name`
console.log('=== per-color профиль/угол products ===')
for (const r of prof) console.log(`  arch=${r.archived} "${r.name}" [${r.group}/${r.cat}/${r.subgroup}]`)
// Stock BEFORE my doc (exclude my doc), only profile-ish + sheets
console.log('\n=== Нипа склад ДО импорта (без моего документа) ===')
const before = await sql`select p.name, sum(m.qty)::float q from stock_movements m join products p on p.id=m.product_id
  where m.org_id=${ORG} and m.warehouse_id=${WH} and m.kind='move' and m.document_id<>${DOC} group by p.name having sum(m.qty)<>0 order by p.name`
for (const r of before) console.log(`  ${r.q}\t${r.name}`)
