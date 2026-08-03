import { z } from 'zod'

// Оплата: контрагент + направление (in=от клиента / out=поставщику) + сумма.
export const createPaymentSchema = z.object({
  orgId: z.string().uuid(),
  contragentId: z.string().uuid(),
  direction: z.enum(['in', 'out']),
  amount: z.coerce.number().positive(),
  date: z.string().optional(),
  cashAccountId: z.string().uuid().optional(),
  comment: z.string().optional().default(''),
})

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>
