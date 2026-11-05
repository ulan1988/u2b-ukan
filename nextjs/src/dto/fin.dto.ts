// Лист «Деньги»: проверка входа для отмены проведения.
import { z } from 'zod'

// Ручная строка листа — сторно созданных ею платежей и возврат в черновик.
export const finUnpostSchema = z.object({ id: z.string().min(1) })

// Авто-строка — отмена самого платежа (инкассация снимается и у головного).
export const finCancelPaySchema = z.object({ paymentId: z.string().uuid() })

export type FinUnpostInput = z.infer<typeof finUnpostSchema>
export type FinCancelPayInput = z.infer<typeof finCancelPaySchema>
