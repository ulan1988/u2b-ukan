import { z } from 'zod'

// Перемещение товара между складами (в т.ч. головной → филиал-производитель).
export const createTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  date: z.string().optional(),
  comment: z.string().optional().default(''),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.coerce.number().positive(),
    unit: z.string().optional().default('шт'),
    price: z.coerce.number().min(0).default(0),   // себестоимость перемещаемого (для оценки склада)
  })).min(1),
})
export type CreateTransferInput = z.infer<typeof createTransferSchema>
