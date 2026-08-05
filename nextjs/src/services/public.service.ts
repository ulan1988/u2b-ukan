// Публичные операции: лид с сайта (заявка) и саморегистрация клиента.
import bcrypt from 'bcryptjs'
import { db } from '../lib/db'
import { organizations, contragents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { createOrder } from './order.service'
import * as userRepo from '../repositories/user.repo'
import { slugify } from '../lib/num'

async function hqOrg() {
  const [hq] = await db.select().from(organizations).where(eq(organizations.kind, 'hq')).limit(1)
  if (hq) return hq
  const [any] = await db.select().from(organizations).limit(1)
  return any
}

// Лид с сайта: создаём контрагента-клиента (если нет) и заявку source=external.
export async function submitLead(name: string, phone: string, text: string) {
  const org = await hqOrg()
  if (!org) return { ok: false as const, error: 'Нет организации' }
  let [client] = await db.select().from(contragents).where(eq(contragents.name, name.trim())).limit(1)
  if (!client) [client] = await db.insert(contragents).values({ orgId: org.id, name: name.trim(), kind: 'client', phone }).returning()
  const { id } = await createOrder({
    orgId: org.id, kind: 'sale', source: 'external', contactId: client.id, fromName: name.trim(),
    phone, comment: text, positions: [],
  } as any, null)
  return { ok: true as const, cardId: id, trackingUrl: `/track?id=${encodeURIComponent(id)}` }
}

// Саморегистрация клиента (email+пароль), роль client, со slug.
export async function register(name: string, email: string, password: string, phone?: string) {
  const [ex] = await userRepo.findByEmail(email.trim())
  if (ex) return { ok: false as const, error: 'Email уже зарегистрирован' }
  const org = await hqOrg()
  if (!org) return { ok: false as const, error: 'Нет организации' }
  const slug = slugify(name, Math.random().toString(36).slice(2))
  const [u] = await userRepo.insertUser({
    orgId: org.id, name, email: email.trim(), password: await bcrypt.hash(password, 10),
    role: 'client', slug, phone: phone || null, active: true,
  })
  return { ok: true as const, slug: u.slug, clientUrl: `/client/${u.slug}` }
}
