// Подключение к Neon (HTTP-драйвер, serverless) + Drizzle.
// db — типобезопасные запросы; sqlClient — «сырой» клиент (батчи/сырой SQL).
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from '../db/schema'

const url = process.env.DATABASE_URL || ''
export const sqlClient = neon(url)
export const db = drizzle(sqlClient, { schema })
