// Подключение к Neon (HTTP-драйвер, serverless) + Drizzle.
// db — типобезопасные запросы; sqlClient — «сырой» клиент (батчи/сырой SQL).
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from '../db/schema'

const url = process.env.DATABASE_URL || ''
// Next.js кеширует fetch (Data Cache), а Neon HTTP ходит через fetch — без этого запрос к базе мог отдавать устаревший
// ответ (кабинет Нипы не видел свежие карточки). Данные всегда живые: кеш выключен.
export const sqlClient = neon(url, { fetchOptions: { cache: 'no-store' } })
export const db = drizzle(sqlClient, { schema })
