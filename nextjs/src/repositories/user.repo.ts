import { db } from '../lib/db'
import { users } from '../db/schema'
import { desc, eq } from 'drizzle-orm'

export const findByEmail = (email: string) =>
  db.select().from(users).where(eq(users.email, email)).limit(1)

export const insertUser = (v: typeof users.$inferInsert) =>
  db.insert(users).values(v).returning()

// Без пароля — список для управления.
export const listUsers = () =>
  db.select({ id: users.id, name: users.name, email: users.email, role: users.role, orgId: users.orgId, active: users.active })
    .from(users).orderBy(desc(users.createdAt))
