import { z } from 'zod'

export const createProductSchema = z.object({
  name: z.string().min(1),
  unit: z.string().default('шт'),
  category: z.enum(['material', 'goods', 'service']).default('goods'),
  group: z.string().optional().default(''),
  cat: z.string().optional().default(''),
  subgroup: z.string().optional().default(''),
  priceIn: z.coerce.number().min(0).default(0),
  priceRetail: z.coerce.number().min(0).default(0),
  priceOpt: z.coerce.number().min(0).default(0),
})

export const createContragentSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1),
  kind: z.enum(['client', 'supplier', 'both']).default('client'),
  priceType: z.enum(['retail', 'opt']).default('retail'),
  phone: z.string().optional().default(''),
})

// Правка/архив: все поля необязательны, плюс тумблер archived.
export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().optional(),
  category: z.enum(['material', 'goods', 'service']).optional(),
  group: z.string().optional(),
  cat: z.string().optional(),
  subgroup: z.string().optional(),
  priceIn: z.coerce.number().min(0).optional(),
  priceRetail: z.coerce.number().min(0).optional(),
  priceOpt: z.coerce.number().min(0).optional(),
  archived: z.boolean().optional(),
})

export const updateContragentSchema = z.object({
  name: z.string().min(1).optional(),
  kind: z.enum(['client', 'supplier', 'both']).optional(),
  priceType: z.enum(['retail', 'opt']).optional(),
  phone: z.string().optional(),
  comment: z.string().optional(),
  archived: z.boolean().optional(),
})

export const createWarehouseSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1),
  isCentral: z.coerce.boolean().default(false),
})

export const createCashAccountSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1),
  kind: z.enum(['cash', 'bank']).default('cash'),
})
