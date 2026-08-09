import { db } from '../lib/db'
import { users } from '../db/schema'
import { desc, eq } from 'drizzle-orm'

export const findByEmail = (email: string) =>
  db.select().from(users).where(eq(users.email, email)).limit(1)

export const findBySlug = (slug: string) =>
  db.select().from(users).where(eq(users.slug, slug)).limit(1)

export const findById = (id: string) =>
  db.select().from(users).where(eq(users.id, id)).limit(1)

export const insertUser = (v: typeof users.$inferInsert) =>
  db.insert(users).values(v).returning()

// Без пароля — список для управления.
export const listUsers = () =>
  db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, orgId: users.orgId, slug: users.slug, priceType: users.priceType, active: users.active, contragentId: users.contragentId })
    .from(users).orderBy(desc(users.createdAt))

export const updateUser = (id: string, patch: Partial<typeof users.$inferInsert>) =>
  db.update(users).set(patch).where(eq(users.id, id)).returning()
