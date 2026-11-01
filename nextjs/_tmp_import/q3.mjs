import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const env = fs.readFileSync('.env.local','utf8')
const url = (env.match(/DATABASE_URL=(.+)/)||[])[1].trim().replace(/\r/,'')
const sql = neon(url)
const ps = await sql`select id, name, unit, category, "group", cat, subgroup, price_in, sort_order from products where archived=false and category<>'material' order by "group", cat, subgroup, name`
console.log('=== non-material products:', ps.length)
for (const r of ps) console.log(`${r.id}\t"${r.name}"\t[${r.group}/${r.cat}/${r.subgroup}]\tin=${r.price_in}\tu=${r.unit}`)
