import { z } from 'zod'

export const orderPositionInput = z.object({
  productId: z.string().uuid().optional(),
  name1c: z.string().optional().default(''),
  oral: z.string().optional().default(''),
  qty: z.coerce.number().min(0).default(0),
  unit: z.string().optional().default('шт'),
  price: z.coerce.number().min(0).default(0),
})

export const createOrderSchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(['sale', 'purchase']).default('sale'),
  contactId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional(),
  fromName: z.string().optional().default(''),
  source: z.string().optional().default('admin_manual'),
  comment: z.string().optional().default(''),
  phone: z.string().optional(),
  positions: z.array(orderPositionInput).default([]),
})

export const actionSchema = z.object({
  action: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional().default({}),
})
