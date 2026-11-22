// Лист «Деньги»: проверка входа для отмены проведения.
import { z } from 'zod'

// Ручная строка листа — сторно созданных ею платежей и возврат в черновик.
export const finUnpostSchema = z.object({ id: z.string().min(1) })

// Авто-строка — отмена самого платежа (инкассация снимается и у головного).
export const finCancelPaySchema = z.object({ paymentId: z.string().uuid() })

// Агрегированная строка головного (слот/контрагент) — сторно ВСЕХ её платежей.
export const finCancelPaysSchema = z.object({ paymentIds: z.array(z.string().uuid()).min(1) })

// Движение контрагента для выбора основания платежа/возврата.
export const finBasisSchema = z.object({ contragentId: z.string().uuid(), dir: z.enum(['in', 'out']), rowId: z.string().uuid().nullish() })

export type FinUnpostInput = z.infer<typeof finUnpostSchema>
export type FinCancelPayInput = z.infer<typeof finCancelPaySchema>
