import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const env = fs.readFileSync('.env.local','utf8')
const url = (env.match(/DATABASE_URL=(.+)/)||[])[1].trim().replace(/\r/,'')
const sql = neon(url)
const mp = await sql`select id, org_id, warehouse_id, product_id, color, width_cm, length_cm, qty, kind from material_pieces order by created_at`
console.log('=== material_pieces count:', mp.length)
for (const r of mp) console.log(`${r.kind}|color="${r.color}"|w=${r.width_cm}|l=${r.length_cm}|qty=${r.qty}|prod=${r.product_id}|org=${r.org_id}|wh=${r.warehouse_id}`)
