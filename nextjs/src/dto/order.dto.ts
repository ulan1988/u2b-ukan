import { z } from 'zod'

export const orderPositionInput = z.object({
  productId: z.string().uuid().optional(),
  name1c: z.string().optional().default(''),
  oral: z.string().optional().default(''),
  qty: z.coerce.number().min(0).default(0),
  unit: z.string().optional().default('шт'),
  price: z.coerce.number().min(0).default(0),
  costPrice: z.coerce.number().min(0).optional(),   // сквозная: закупочная цена (что платим поставщику)
  transit: z.boolean().optional(),                         // сквозная СТРОКА (drop-ship, мимо склада)
  widthCm: z.coerce.number().optional(),                   // ширина изделия в см (раскрой)
  respUserId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  specItemId: z.string().uuid().optional(),                // вынесена из позиции проекта
  deadline: z.string().optional(),
  payment: z.string().optional().default(''),
})

export const createOrderSchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(['sale', 'purchase']).default('sale'),
  fromId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional(),
  fromName: z.string().optional().default(''),
  source: z.string().optional().default('admin_manual'),
  screen: z.string().optional(),
  block: z.string().optional(),
  isDraft: z.boolean().optional(),
  specProjectId: z.string().uuid().optional(),
  transit: z.boolean().optional(),                        // сквозная продажа (drop-ship)
  transitAgent: z.string().optional(),                     // имя сквозного агента (Берик) — инфо
  comment: z.string().optional().default(''),
  phone: z.string().optional(),
  deadline: z.string().optional(),
  prodOrder: z.boolean().optional(),                       // заказ мастера производства → код ЗК-NN-DDMMYY
  positions: z.array(orderPositionInput).default([]),
})

export const assignSchema = z.object({
  respUserId: z.string().uuid(),
})

export const posStatusSchema = z.object({
  posId: z.string().optional(),                          // нет posId → применить ко всем позициям
  status: z.enum(['В работе', 'В пути', 'Доставлено']),
})

export const actionSchema = z.object({
  action: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional().default({}),
})
