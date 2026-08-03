import { z } from 'zod'

// Вход производства: сырьё (списывается) → готовый товар (приходуется).
// Готовый товар — размерное ценообразование: длина×ширина(см)→м²×ставка×кол-во.
const inputLine = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  price: z.coerce.number().min(0).default(0),
})

const outputLine = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  lengthCm: z.coerce.number().min(0).optional(),
  widthCm: z.coerce.number().min(0).optional(),
  rate: z.coerce.number().min(0).optional(),   // ставка за м²
  price: z.coerce.number().min(0).optional(),  // если без размеров — цена за единицу
})

export const createProductionSchema = z.object({
  orgId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  date: z.string().optional(),
  comment: z.string().optional().default(''),
  inputs: z.array(inputLine).default([]),
  outputs: z.array(outputLine).min(1),
})

export type CreateProductionInput = z.infer<typeof createProductionSchema>
