import { z } from 'zod'

// Вход для создания приходной накладной (закуп): поставщик + склад + строки.
export const purchaseLineSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  price: z.coerce.number().min(0),
  unit: z.string().optional(),
  sourcePosId: z.string().optional(),   // атомарный ID позиции карточки ({cardId}-P{n}) — тянем сквозь цепочку
  // СУММА строки, вписанная руками: накладная завода даётся суммой, и итог должен сойтись
  // до копейки. Если передана — берём её как есть, а не кол-во×цену (там копейки теряются).
  amount: z.coerce.number().min(0).optional(),
})

export const createPurchaseSchema = z.object({
  orgId: z.string().uuid(),
  contragentId: z.string().uuid(),      // поставщик
  warehouseId: z.string().uuid(),
  date: z.string().optional(),          // YYYY-MM-DD, по умолчанию сегодня
  comment: z.string().optional().default(''),
  lines: z.array(purchaseLineSchema).min(1),
  sourceOrderId: z.string().optional(), // номер карточки-основания (ЗП-…/ПР-…), чтобы связь не терялась
  sourceDocId: z.string().uuid().optional(), // id исходной накладной (для возврата — узнать откуда)
  // ПОЛУЧАТЕЛЬ прихода: товар не остаётся на складе — сразу уходит ему расходной той же
  // датой по ЕГО цене (спец/опт/розница). Филиалу его приходная родится зеркалом.
  recipientId: z.string().uuid().optional(),
})

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>

// Вход для расходной накладной (продажа): заказчик + склад + строки.
// Форма та же, что у прихода (contragentId = заказчик, цена = продажная).
export const createSaleSchema = createPurchaseSchema
export type CreateSaleInput = z.infer<typeof createSaleSchema>
