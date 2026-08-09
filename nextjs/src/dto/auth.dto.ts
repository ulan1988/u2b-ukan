import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
})

export const createUserSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(4),
  role: z.enum(['admin', 'super_admin', 'bookkeeper', 'manager', 'logist', 'branch', 'client', 'supplier_client', 'warehouse_manager', 'order_desk']).default('manager'),
})
