import bcrypt from 'bcryptjs'
import type { z } from 'zod'
import { createToken } from '../lib/auth'
import { slugify } from '../lib/num'
import * as userRepo from '../repositories/user.repo'
import type { createUserSchema } from '../dto/auth.dto'

export async function login(email: string, password: string) {
  const [u] = await userRepo.findByEmail(email.trim())
  if (!u || !u.password || !u.active) return null
  const ok = await bcrypt.compare(password, u.password)
  if (!ok) return null
  const session = { id: u.id, name: u.name, role: u.role, orgId: u.orgId, slug: u.slug || undefined }
  return { token: await createToken(session), user: session }
}

export async function createUser(i: z.infer<typeof createUserSchema>) {
  const hash = await bcrypt.hash(i.password, 10)
  // slug для порталов (логист/филиал/клиент/…). salt из времени — Node-рантайм, ок.
  const slug = slugify(i.name, Math.random().toString(36).slice(2))
  const [u] = await userRepo.insertUser({ orgId: i.orgId, name: i.name, email: i.email.trim(), password: hash, role: i.role, slug, active: true })
  return { id: u.id, name: u.name, email: u.email, role: u.role, slug: u.slug }
}

export const listUsers = () => userRepo.listUsers()
