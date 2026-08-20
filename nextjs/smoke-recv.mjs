import { neon } from '@neondatabase/serverless'
import { SignJWT } from 'jose'
import fs from 'fs'
const env = fs.readFileSync('.env.local','utf8').replace(/\r/g,'')
const url = env.match(/DATABASE_URL=(.+)/)[1].trim()
const secret = new TextEncoder().encode((env.match(/AUTH_SECRET=(.+)/)?.[1]||'').trim().replace(/^['"]|['"]$/g,''))
const sql = neon(url)
const BASE='http://localhost:3000'
const ok=(c,m)=>console.log(`${c?'✅':'❌'} ${m}`)

const [org] = await sql`select id from organizations where kind='hq' limit 1`
const [sup] = await sql`select id from contragents where org_id=${org.id} limit 1`
const [wh]  = await sql`select id from warehouses where org_id=${org.id} order by is_central desc limit 1`
const [adm] = await sql`select id,name,role from users where role in ('admin','super_admin') limit 1`
const token = await new SignJWT({ id:adm.id, name:adm.name, role:adm.role, orgId:org.id }).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1d').sign(secret)

async function ensureSheet(name){ let [p]=await sql`select id from products where name=${name}`; if(!p){[p]=await sql`insert into products (name,unit,category,"group",subgroup) values (${name},'лист','material','Материалы','8017') returning id`} return p.id }
const s035 = await ensureSheet('СМОУК Лист плоский 8017 0,35 глян')
const s04  = await ensureSheet('СМОУК Лист плоский 8017 0,4 глян')
await sql`delete from material_pieces where product_id in (${s035},${s04})`

const post = (b)=>fetch(`${BASE}/api/documents`,{method:'POST',headers:{'content-type':'application/json',cookie:`u2b_session=${token}`},body:JSON.stringify(b)}).then(async r=>({s:r.status,b:await r.json()}))
const pieces = async id => sql`select qty,color,width_cm,kind from material_pieces where product_id=${id} and kind='sheet'`

let r = await post({ orgId:org.id, contragentId:sup.id, warehouseId:wh.id, lines:[{productId:s035, qty:10, price:2000, unit:'лист'}] })
ok(r.s===201, `приход 0,35×10 создан (${r.s})`)
let p04 = await pieces(s04), p035 = await pieces(s035)
ok(p04[0] && Number(p04[0].qty)===10 && p04[0].color==='8017' && Number(p04[0].width_cm)===125, `склад: 0,4 = ${p04[0]?.qty} шт (ждём 10, нормализация 0,35→0,4)`)
ok(p035.length===0, `под 0,35 склада нет (${p035.length}) — слился в 0,4`)

r = await post({ orgId:org.id, contragentId:sup.id, warehouseId:wh.id, lines:[{productId:s04, qty:5, price:2200, unit:'лист'}] })
p04 = await pieces(s04)
ok(Number(p04[0].qty)===15, `склад: 0,4 = ${p04[0]?.qty} (ждём 15)`)

const docs = await sql`select dl.price from document_lines dl join documents d on d.id=dl.document_id where d.contragent_id=${sup.id} and dl.product_id in (${s035},${s04})`
ok(docs.some(d=>Number(d.price)===2000) && docs.some(d=>Number(d.price)===2200), `цены в документе: ${docs.map(d=>d.price).join(', ')} (склад без цены)`)

const dids = await sql`select id from documents where contragent_id=${sup.id} and type='purchase' and total in ('20000','11000')`
for (const d of dids){ await sql`delete from stock_movements where document_id=${d.id}`; await sql`delete from document_lines where document_id=${d.id}`; await sql`delete from documents where id=${d.id}` }
await sql`delete from material_pieces where product_id in (${s035},${s04})`
await sql`delete from products where id in (${s035},${s04})`
console.log('— тест-данные удалены —')
