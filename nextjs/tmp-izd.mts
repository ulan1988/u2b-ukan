import fs from 'fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (!m) continue
  process.env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^'(.*)'$/, '$1')
}
const { db, sqlClient } = await import('./src/lib/db')
const { organizations, warehouses, products } = await import('./src/db/schema')
const { eq, and, sql } = await import('drizzle-orm')
const [kr] = await db.select().from(organizations).where(eq(organizations.kind, 'seller'))
const whs = await db.select().from(warehouses).where(and(eq(warehouses.orgId, kr.id), eq(warehouses.archived, false)))
const wh = whs.find(w => w.isCentral) || whs[0]
const [umb] = await db.select().from(products).where(sql`lower(trim(${products.name})) = 'изделие'`)
console.log('umbrella:', umb.id, 'price_in', umb.priceIn)
const mv = await sqlClient`
  select m.id, d.number, d.type, d.date, m.qty::float q
  from stock_movements m join documents d on d.id=m.document_id
  where m.warehouse_id=${wh.id} and m.product_id=${umb.id} order by d.date
` as unknown as Array<any>
console.log('движения «Изделие»:'); for (const m of mv) console.log(`   ${m.number} ${m.type} ${m.date} = ${m.q}  [${m.id}]`)
const dl = await sqlClient`
  select dl.id, d.number, dl.qty::float q, dl.width_cm::float w, dl.price::float p
  from document_lines dl join documents d on d.id=dl.document_id
  where dl.product_id=${umb.id} and d.org_id=${kr.id} order by d.date
` as unknown as Array<any>
console.log('\nстроки документов:'); for (const l of dl) console.log(`   ${l.number} | ${l.q} шт | ${l.w || '—'} см | цена ${l.p}  [${l.id}]`)
