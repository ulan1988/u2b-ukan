import { readFileSync } from 'fs'
import { SignJWT } from 'jose'
import { neon } from '@neondatabase/serverless'
const env = readFileSync('./.env.local','utf8')
const line = k => env.split('\n').find(l=>l.startsWith(k)).split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'').replace(/\r/g,'')
const url = line('DATABASE_URL'); const secret = new TextEncoder().encode(line('AUTH_SECRET'))
const sql = neon(url)
const BASE='http://localhost:3000'
async function tok(u){ return new SignJWT({ id:u.id, name:u.name, role:u.role, orgId:u.orgId, slug:u.slug, contragentId:u.contragentId }).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('2h').sign(secret) }
async function req(path, method, user, body){
  const t = await tok(user)
  const r = await fetch(BASE+path, { method, headers:{'Content-Type':'application/json','Cookie':`u2b_session=${t}`}, body: body?JSON.stringify(body):undefined })
  const txt = await r.text(); try { return { status:r.status, json:JSON.parse(txt) } } catch { return { status:r.status, text:txt.slice(0,200) } }
}
const mashon = { id:'b6821f67-90ac-4f5e-ba37-74faeeefcea7', name:'Машон', role:'supplier_client', orgId:'e015c65a-1574-4b36-85d8-0f9ac6e75484', slug:'mashon-k055', contragentId:'496eb2a9-80b7-4a7b-8939-dca44af8cebd' }
const branch = { id:'b7a2424b-198b-4adc-8134-f640874136c0', name:'Нипа листогиб', role:'branch', orgId:'50d5113c-06d0-419b-92cf-97a13c4fe94d', slug:'filial-proizvoditel-x70z', contragentId:'6a4289f6-84d9-4fa3-be87-5228761513d3' }

// 1) Машон создаёт заказ кабинета
const create = await req('/api/client/orders','POST',mashon,{ positions:[{ name1c:'СМОУК Изделие 9003', oral:'СМОУК Изделие 9003', qty:5, unit:'шт', widthCm:20 }] })
console.log('CREATE:', create.status, create.json?.id || create.json?.error || create.text)
const cardId = create.json?.id
if(cardId){
  const row = await sql`select id,org_id,kind,screen,contact_id,c.name cn from orders o left join contragents c on c.id=o.contact_id where o.id=${cardId}`
  console.log('  → карточка:', row[0]?.id, 'org=',row[0]?.org_id?.slice(0,4),'kind=',row[0]?.kind,'заказчик=',row[0]?.cn||(row[0]?.contact_id?'??':'ПУСТО'))
}
console.log('CARD_ID='+cardId)
