import { z } from 'zod'

// Вход для создания приходной накладной (закуп): поставщик + склад + строки.
export const purchaseLineSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  price: z.coerce.number().min(0),
})

export const createPurchaseSchema = z.object({
  orgId: z.string().uuid(),
  contragentId: z.string().uuid(),      // поставщик
  warehouseId: z.string().uuid(),
  date: z.string().optional(),          // YYYY-MM-DD, по умолчанию сегодня
  comment: z.string().optional().default(''),
  lines: z.array(purchaseLineSchema).min(1),
})

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>
