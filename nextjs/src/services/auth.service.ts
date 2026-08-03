import bcrypt from 'bcryptjs'
import type { z } from 'zod'
import { createToken } from '../lib/auth'
import * as userRepo from '../repositories/user.repo'
import type { createUserSchema } from '../dto/auth.dto'

export async function login(email: string, password: string) {
  const [u] = await userRepo.findByEmail(email.trim())
  if (!u || !u.password || !u.active) return null
  const ok = await bcrypt.compare(password, u.password)
  if (!ok) return null
  const session = { id: u.id, name: u.name, role: u.role, orgId: u.orgId }
  return { token: await createToken(session), user: session }
}

export async function createUser(i: z.infer<typeof createUserSchema>) {
  const hash = await bcrypt.hash(i.password, 10)
  const [u] = await userRepo.insertUser({ orgId: i.orgId, name: i.name, email: i.email.trim(), password: hash, role: i.role, active: true })
  return { id: u.id, name: u.name, email: u.email, role: u.role }
}

export const listUsers = () => userRepo.listUsers()
