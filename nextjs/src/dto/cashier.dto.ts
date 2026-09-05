import { z } from 'zod'

// Касса продавца (филиал-магазин): пробить чек — позиции из каталога + оплата.
// Цена берётся розничная из каталога, но продавец может править её в чеке.
export const sellPositionSchema = z.object({
  productId: z.string().uuid().optional(),
  name1c: z.string().min(1),
  oral: z.string().optional().default(''),
  qty: z.coerce.number().positive(),
  unit: z.string().optional().default('шт'),
  price: z.coerce.number().nonnegative().default(0),
  widthCm: z.coerce.number().optional(),
})

export const sellSchema = z.object({
  uid: z.string().uuid().optional(),              // просмотр-как: пишем от имени филиала (см. viewas)
  contactId: z.string().uuid().optional(),        // покупатель; пусто → «Розничный покупатель»
  sellerId: z.string().uuid().optional(),         // продавец за кассой (employees.id) — выбирается на телефоне
  seller: z.string().optional().default(''),      // его имя на момент чека
  comment: z.string().optional().default(''),
  cash: z.coerce.number().nonnegative().optional().default(0),
  kaspi: z.coerce.number().nonnegative().optional().default(0),
  qr: z.coerce.number().nonnegative().optional().default(0),
  change: z.coerce.number().nonnegative().optional().default(0),
  changeFrom: z.string().optional().default(''),
  positions: z.array(sellPositionSchema).min(1),
})
