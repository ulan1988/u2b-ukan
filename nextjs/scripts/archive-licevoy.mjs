// Разовый скрипт: архивировать лишний счёт «Лицевой счет» головного (он же «Банковский счет»).
// Безопасно — архивирует только если по счёту НЕТ платежей. Запуск: node scripts/archive-licevoy.mjs
import fs from 'fs'
import { neon } from '@neondatabase/serverless'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/DATABASE_URL\s*=\s*(.+)/)[1].trim().replace(/^['"]|['"]$/g, '').replace(/\r/g, '')
const sql = neon(url)
const ID = '340cdd24-41f6-49f2-ae8a-9ece54c67960'   // Лицевой счет (Адал Строй 2)

const r = await sql`update cash_accounts set archived=true
  where id=${ID} and (select count(*) from payments p where p.cash_account_id=${ID})=0
  returning name, archived`
console.log(r.length ? `✓ Архивирован: ${r[0].name}` : '⚠ Не архивирован (есть платежи или уже архивирован)')
