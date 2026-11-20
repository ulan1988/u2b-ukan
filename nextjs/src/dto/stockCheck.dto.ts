import { z } from 'zod'

// Ревизия логиста: день + факт по позициям. Отправляется ЦЕЛИКОМ (решение владельца 20.11.2026).
export const stockCheckSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().max(500).optional(),
  rows: z.array(z.object({
    productId: z.string().uuid(),
    fact: z.coerce.number().min(0).nullable().optional(),   // пусто = не считал
  })).max(2000),
})
export type StockCheckInput = z.infer<typeof stockCheckSchema>
