import { readFileSync } from 'fs'
import { SignJWT } from 'jose'
import { neon } from '@neondatabase/serverless'
const env=readFileSync('./.env.local','utf8')
const line=k=>env.split('\n').find(l=>l.startsWith(k)).split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'').replace(/\r/g,'')
const secret=new TextEncoder().encode(line('AUTH_SECRET')); const sql=neon(line('DATABASE_URL')); const BASE='http://localhost:3000'
const ORG='e015c65a-1574-4b36-85d8-0f9ac6e75484'
const admin={id:'11111111-1111-1111-1111-111111111111',name:'Улан',role:'super_admin',orgId:ORG,slug:null,contragentId:null}
const tok=u=>new SignJWT(u).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(secret)
async function req(path,method,body){const t=await tok(admin);const r=await fetch(BASE+path,{method,headers:{'Content-Type':'application/json','Cookie':`u2b_session=${t}`},body:body?JSON.stringify(body):undefined});const txt=await r.text();try{return{s:r.status,j:JSON.parse(txt)}}catch{return{s:r.status,t:txt.slice(0,120)}}}
const CLIENT='2fba2e54-e984-4ded-9394-28eb9023ce7f' // Абай Нурмаханов
const LOGIST='2cc6a753' // Бауыржан (short)
const logistFull=(await sql`select id from users where id::text like ${LOGIST+'%'}`)[0].id
const ITEM='Евро брус МП RAL8017 0,4мм 0,24х6м'
const waiting=async saleId=>{const r=await sql`select 1 from procurement_links pl join orders o on o.id=pl.purchase_card_id where pl.sale_card_id=${saleId} and o.linked_doc_id is null and o.is_cancelled=false limit 1`;return r.length>0}
const st=async(id,tag)=>{const o=await sql`select screen,status,linked_doc_id from orders where id=${id}`;console.log(`  ${tag}: ${id} scr=${o[0].screen} st=${o[0].status} накладная=${o[0].linked_doc_id?'ЕСТЬ':'нет'} серая(ждёт закупа)=${await waiting(id)}`)}

console.log('=== 1. Создаём продажу Абаю (Евро брус ×10, без поставщика) ===')
const cr=await req('/api/orders','POST',{orgId:ORG,kind:'sale',source:'admin_manual',fromName:'Абай Нурмаханов',contactId:CLIENT,positions:[{name1c:ITEM,oral:ITEM,qty:10,unit:'шт',respUserId:logistFull}]})
const saleId=cr.j?.id||cr.j?.data?.id; console.log('  создано:',cr.s,saleId)
await st(saleId,'продажа')

console.log('=== 2. Автозакуп: потребность → В закуп ===')
const sum=await req(`/api/procurement/summary?orgId=${ORG}`,'GET')
const need=(sum.j||[]).find(x=>x.name===ITEM)
console.log('  в потребности:',need?`${need.name} ×${need.total}`:'НЕТ')
const stg=await req('/api/procurement/stage','POST',{items:[{name:ITEM,unit:'шт',total:10,rows:[{cardId:saleId,qty:10}]}]})
console.log('  В закуп:',stg.s,stg.j?.draftId,'добавлено',stg.j?.added)
const zpId=stg.j?.draftId
// проставить поставщика+логиста позициям закупа (для finalize)
const zpos=await sql`select id,supplier_id,resp_user_id from order_positions where card_id=${zpId}`
const supAny=(await sql`select id from contragents where name='Завод Металл профиль' limit 1`)[0]?.id
for(const p of zpos){await req(`/api/orders/${zpId}/position`,'PATCH',{posId:p.id,supplierId:p.supplier_id||supAny,respUserId:p.resp_user_id||logistFull})}

console.log('=== 3. Оформить закуп (finalizePurchase) → продажа к логисту ===')
const fin=await req(`/api/orders/${zpId}/action`,'POST',{action:'finalizePurchase'})
console.log('  finalize:',fin.s,fin.j?.error||'ok')
await st(saleId,'продажа после закупа (ожидаем: outgoing, серая=true)')

console.log('=== 4. Логист доставил ЗАКУП → приходная ===')
const zp2=await sql`select id from order_positions where card_id=${zpId}`
for(const p of zp2){await req(`/api/orders/${zpId}/pos`,'POST',{posId:p.id,status:'Доставлено'})}
await st(zpId,'закуп (ожидаем: накладная ЕСТЬ)')
await st(saleId,'продажа после прихода (ожидаем: серая=false, активна)')

console.log('=== 5. Логист доставил ПРОДАЖУ заказчику → расходная ===')
const sp=await sql`select id,leg from order_positions where card_id=${saleId}`
for(const p of sp){await req(`/api/orders/${saleId}/pos`,'POST',{posId:p.id,status:'Доставлено'})}
await st(saleId,'продажа финал (ожидаем: накладная ЕСТЬ, bookkeeping)')

console.log('\nTEST_SALE='+saleId+' TEST_ZP='+zpId)
