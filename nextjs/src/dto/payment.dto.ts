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

// Оплата из кабинета клиента ждёт подтверждения: принять (снять метку) или
// отказать (платёж удаляется, деньги со счёта, долг клиента возвращается).
export const reviewPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  accept: z.coerce.boolean(),
})
export type ReviewPaymentInput = z.infer<typeof reviewPaymentSchema>

// Возврат денег от головного на счёт филиала (после инкассации не хватает на ЗП).
export const returnFromHqSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type ReturnFromHqInput = z.infer<typeof returnFromHqSchema>
