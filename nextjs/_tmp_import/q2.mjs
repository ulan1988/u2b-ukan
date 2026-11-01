import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const env = fs.readFileSync('.env.local','utf8')
const url = (env.match(/DATABASE_URL=(.+)/)||[])[1].trim().replace(/\r/,'')
const sql = neon(url)
const lists = await sql`select id, name, category, "group", cat, subgroup, price_in from products where name ilike '%лист%' and archived=false order by name`
console.log('=== ЛИСТ products:', lists.length)
for (const r of lists) console.log(`${r.id} | "${r.name}" | cat=${r.category} | ${r.group}/${r.cat}/${r.subgroup} | in=${r.price_in}`)
