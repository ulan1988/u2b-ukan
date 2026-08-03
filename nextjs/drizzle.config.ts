// drizzle-kit сам .env.local НЕ читает — подгружаем вручную.
import { readFileSync } from 'fs'
import type { Config } from 'drizzle-kit'

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* нет .env.local — ок, переменные из окружения */ }

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL || '' },
} satisfies Config
