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

export async function userBySlug(slug: string) {
  const [u] = await userRepo.findBySlug(slug)
  return u ? { id: u.id, name: u.name, orgId: u.orgId, role: u.role, slug: u.slug } : null
}

// Цель запроса портала: обычно сам пользователь; админ может смотреть чужой (uid).
export async function resolveTarget(session: any, uid?: string | null) {
  const isAdmin = ['admin', 'super_admin', 'bookkeeper'].includes(session.role)
  if (uid && isAdmin) {
    const [u] = await userRepo.findById(uid)
    if (u) return { id: u.id, orgId: u.orgId }
  }
  return { id: session.id, orgId: session.orgId }
}

// Правка пользователя (имя/роль/email/телефон/slug/тип цены/активность).
export async function editUser(id: string, patch: any) {
  const set: Record<string, any> = {}
  for (const k of ['name', 'role', 'email', 'phone', 'slug', 'priceType', 'active'] as const) {
    if (patch[k] !== undefined) set[k] = patch[k]
  }
  if (set.email) set.email = String(set.email).trim() || null
  const [u] = await userRepo.updateUser(id, set)
  return { id: u.id, name: u.name, role: u.role, email: u.email, active: u.active }
}

// «Удаление» = деактивация (hard-delete ломает FK на историю/заявки).
export async function deactivateUser(id: string) {
  await userRepo.updateUser(id, { active: false })
  return { ok: true }
}
