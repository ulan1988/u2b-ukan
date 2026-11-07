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
  clientCode: z.string().max(20).optional().default(''),  // код чека — последние цифры телефона покупателя
  comment: z.string().optional().default(''),
  cash: z.coerce.number().nonnegative().optional().default(0),
  kaspi: z.coerce.number().nonnegative().optional().default(0),
  qr: z.coerce.number().nonnegative().optional().default(0),
  change: z.coerce.number().nonnegative().optional().default(0),
  changeFrom: z.string().optional().default(''),
  discountSum: z.coerce.number().nonnegative().optional().default(0),   // скидка по чеку (₸)
  discountPct: z.coerce.number().nonnegative().optional().default(0),   // скидка по чеку (%), инфо
  positions: z.array(sellPositionSchema).min(1),
})

// «Долг товаров» (касса магазина): взяли у соседа товар в долг / вернули товаром. Отдельный журнал.
export const goodsDebtSchema = z.object({
  uid: z.string().uuid().optional(),
  contragentId: z.string().uuid(),                // сосед — только контрагент этого магазина
  productId: z.string().uuid().optional(),        // привязка к каталогу (необязательна)
  productName: z.string().min(1),                 // имя товара (из каталога или свободно)
  unit: z.string().optional().default('шт'),
  // мы ДОЛЖНЫ: take = взяли в долг, return = вернули товаром, pay = оплатили деньгами;
  // нам ДОЛЖНЫ: give = отдали в долг, giveback = сосед вернул товаром, receive = сосед оплатил деньгами
  direction: z.enum(['take', 'return', 'give', 'giveback', 'pay', 'receive']),
  qty: z.coerce.number().positive(),
  note: z.string().optional().default(''),
  accountId: z.string().uuid().optional(),           // для pay/receive — счёт движения денег
  amount: z.coerce.number().nonnegative().optional(),// для pay/receive — сумма оплаты
})

// Возврат по чеку: позиции с кол-вом (пусто → весь чек, остаток по каждой) + счёт возврата.
export const returnSchema = z.object({
  uid: z.string().uuid().optional(),
  cardId: z.string().min(1),
  items: z.array(z.object({ posId: z.string(), qty: z.coerce.number().positive() })).optional(), // пусто → весь чек
  accountId: z.string().uuid().optional(),        // счёт возврата (cash_accounts.id); пусто → «в долг» (без денег)
})

// Правка пробитого чека (касса магазина): новый состав позиций + оплата + скидка/покупатель.
// Старая накладная сторнируется, чек проводится заново (см. cashier.service.editCheck).
export const editCheckSchema = z.object({
  uid: z.string().uuid().optional(),
  cardId: z.string().min(1),
  positions: z.array(z.object({
    posId: z.string().optional(),               // есть → правим строку, нет → добавляем новую
    productId: z.string().uuid().optional(),
    name1c: z.string().min(1),
    qty: z.coerce.number().positive(),
    unit: z.string().optional(),
    price: z.coerce.number().nonnegative(),
    widthCm: z.coerce.number().optional(),
  })).min(1),
  cash: z.coerce.number().nonnegative().optional().default(0),
  kaspi: z.coerce.number().nonnegative().optional().default(0),
  qr: z.coerce.number().nonnegative().optional().default(0),
  change: z.coerce.number().nonnegative().optional().default(0),
  changeFrom: z.string().optional().default(''),
  discountSum: z.coerce.number().nonnegative().optional(),
  discountPct: z.coerce.number().nonnegative().optional(),
  contactId: z.string().uuid().optional(),
})

// Погашение долга по чеку: смешанная оплата по счетам + день проведения
// (можно задним числом — деньги попадут в кассу того дня).
export const payDebtSchema = z.object({
  uid: z.string().uuid().optional(),
  cardId: z.string().min(1),
  splits: z.array(z.object({ accountId: z.string().uuid(), amount: z.coerce.number().positive() })).min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type PayDebtInput = z.infer<typeof payDebtSchema>
