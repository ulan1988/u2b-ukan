// Домен: заявки/карточки (админка, доска, порталы).
import { getArray, getObj, getOne, post, patch as patch2, send } from './http'

export const listOrders = (orgId: string) => getArray(`/api/orders?orgId=${orgId}`)
export const listByScreen = (orgId: string, screen: string) => getArray(`/api/orders?orgId=${orgId}&screen=${screen}`)
export const getCard = (id: string) => getOne(`/api/orders/${id}`)
export const createOrder = (body: any) => post('/api/orders', body)

export async function orderAction(id: string, action: string, payload: Record<string, any> = {}) {
  const r = await post(`/api/orders/${id}/action`, { action, payload })
  return { ok: r.ok, error: r.error as string | undefined }
}
export async function assignLogist(id: string, respUserId: string) {
  const r = await post(`/api/orders/${id}/assign`, { respUserId })
  return { ok: r.ok }
}
// Мастер → логисту: отправить целиком (posIds не задан) или частями (выбранные позиции).
export async function sendOrder(cardId: string, posIds?: string[], pickup?: boolean) {
  const r = await post(`/api/orders/${cardId}/send`, { ...(posIds && posIds.length ? { posIds } : {}), ...(pickup ? { pickup: true } : {}) })
  return { ok: r.ok, error: r.error as string | undefined, remaining: r.data?.remaining as number | undefined }
}
// Сплит карточки: выбранные позиции → новая карточка.
export async function splitCard(cardId: string, posIds: string[]) {
  const r = await post(`/api/orders/${cardId}/split`, { posIds })
  return { ok: r.ok, error: r.error as string | undefined, id: r.data?.id as string | undefined }
}
// Касса мастера: оплатить (продать) — нал/каспи/сдача, долг авто.
export async function payCard(cardId: string, body: { cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string; localDebt?: boolean; markOnly?: boolean; date?: string }) {
  const r = await post(`/api/orders/${cardId}/pay`, body)
  return { ok: r.ok, error: r.error as string | undefined, debt: r.data?.debt as number | undefined, number: r.data?.number as string | undefined, pending: r.data?.pending as boolean | undefined }
}
export async function unpostSale(cardId: string) {
  const r = await send(`/api/orders/${cardId}/pay`, 'DELETE')
  return { ok: r.ok, error: r.error as string | undefined }
}
// Погашение долга по чеку (касса магазина): смешанная оплата — splits [{accountId, amount}].
export async function payDebt(body: { uid?: string; cardId: string; splits: { accountId: string; amount: number }[]; date?: string }) {
  const r = await post('/api/branch/debt', body)
  return { ok: r.ok, error: r.error as string | undefined, paid: r.data?.paid as number | undefined, debtLeft: r.data?.debtLeft as number | undefined }
}
// Возврат по чеку (касса магазина): позиции с кол-вом (пусто → весь чек), цена возврата
// (пусто → себестоимость) + счёт возврата.
export async function returnSale(body: { uid?: string; cardId: string; items?: { posId: string; qty: number; price?: number }[]; accountId?: string }) {
  const r = await post('/api/branch/return', body)
  return {
    ok: r.ok, error: r.error as string | undefined,
    number: r.data?.number as string | undefined,
    refund: r.data?.refund as number | undefined,
    returned: r.data?.returned as number | undefined,
  }
}
// Обмен по чеку (касса магазина): что сдают (позиции чека) и что выдаём взамен.
// Только на равную сумму — деньги не трогаются, исходный чек остаётся на своём дне.
export async function exchangeCheck(body: {
  uid?: string; cardId: string
  back: { posId: string; qty: number }[]
  out: { productId?: string; name1c: string; oral?: string; qty: number; unit?: string; price: number; widthCm?: number }[]
}) {
  const r = await post('/api/branch/exchange', body)
  return {
    ok: r.ok, error: r.error as string | undefined,
    retNumber: r.data?.retNumber as string | undefined,
    saleNumber: r.data?.saleNumber as string | undefined,
    sum: r.data?.sum as number | undefined,
  }
}
// Производство: внести изделия карточки в базу (создать товар + выпуск на склад).
export async function produceToBase(cardId: string, date?: string) {
  const r = await post(`/api/orders/${cardId}/tobase`, date ? { date } : {})
  return { ok: r.ok, error: r.error as string | undefined, number: r.data?.number as string | undefined, produced: r.data?.produced as number | undefined }
}
export async function setPosStatus(cardId: string, status: string, posId?: string) {
  const r = await post(`/api/orders/${cardId}/pos`, { posId, status })
  return { ok: r.ok }
}
export async function postInvoice(cardId: string) {
  const r = await post(`/api/orders/${cardId}/invoice`)
  return { ok: r.ok, error: r.error as string | undefined, number: r.data?.number as string | undefined }
}

export const listHistory = (orgId: string, f: { user?: string; from?: string; to?: string } = {}) => {
  const p = new URLSearchParams({ orgId }); if (f.user) p.set('user', f.user); if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to)
  return getArray(`/api/history?${p}`)
}

export const listMessages = (cardId: string) => getArray(`/api/orders/${cardId}/messages`)
export const sendMessage = (cardId: string, text: string) => post(`/api/orders/${cardId}/messages`, { text })
export const chatThreads = (orgId?: string) => getArray(`/api/chat/threads${orgId ? `?orgId=${orgId}` : ''}`)

// Позиции карточки (правка/добавление) — логист/филиал.
export async function updatePosition(cardId: string, posId: string, patch: any) {
  const r = await patch2(`/api/orders/${cardId}/position`, { posId, ...patch }); return { ok: r.ok }
}
export const addPosition = (cardId: string, body: any) => post(`/api/orders/${cardId}/position`, body)
export async function deletePosition(cardId: string, posId: string) {
  const r = await send(`/api/orders/${cardId}/position?posId=${posId}`, 'DELETE'); return { ok: r.ok }
}
export async function updateCard(cardId: string, patch: any) {
  const r = await patch2(`/api/orders/${cardId}`, patch); return { ok: r.ok }
}

// Порталы
export const logistOrders = (uid?: string) => getArray(`/api/logist/orders${uid ? `?uid=${uid}` : ''}`)
export const clientOrders = (uid?: string) => getArray(`/api/client/orders${uid ? `?uid=${uid}` : ''}`)
export const branchOrders = (uid?: string) => getArray(`/api/branch/orders${uid ? `?uid=${uid}` : ''}`)
// «Долг товаров» (касса магазина): журнал взяли/вернули + свёрнутые остатки.
export const goodsDebts = (uid?: string) => getObj<{ entries: any[]; balances: any[] }>(`/api/branch/goods-debt${uid ? `?uid=${uid}` : ''}`, { entries: [], balances: [] })
export async function addGoodsDebt(body: { uid?: string; contragentId: string; productId?: string; productName: string; unit?: string; direction: 'take' | 'return' | 'give' | 'giveback' | 'pay' | 'receive'; qty: number; note?: string; accountId?: string; amount?: number }) {
  const r = await post('/api/branch/goods-debt', body)
  return { ok: r.ok, error: r.error as string | undefined, id: r.data?.id as string | undefined }
}
// Инкассация филиала → QR-счёт головного.
export async function encashment(body: { uid?: string; fromAccountId: string; amount: number }) {
  const r = await post('/api/branch/encashment', body)
  return { ok: r.ok, error: r.error as string | undefined, headQR: r.data?.headQR as string | undefined }
}
// Отмена продажи (касса магазина): сторно + аннулирование чека.
export async function cancelStoreSale(body: { uid?: string; cardId: string }) {
  const r = await post('/api/branch/cancel-sale', body)
  return { ok: r.ok, error: r.error as string | undefined }
}
export async function deleteGoodsDebt(id: string, uid?: string) {
  const r = await send(`/api/branch/goods-debt?id=${id}${uid ? `&uid=${uid}` : ''}`, 'DELETE')
  return { ok: r.ok, error: r.error as string | undefined }
}
// Смена мастера: сводка дня + добавление расхода (ЗП/текущий) + закрытие.
export const shiftSummary = (date: string, uid?: string) => getOne<any>(`/api/branch/shift?date=${date}${uid ? `&uid=${uid}` : ''}`)
export const addShiftExpense = (body: { kind: 'salary' | 'current'; who?: string; article?: string; accountId: string; amount: number; date: string }) => post('/api/branch/shift', body)
export const closeShiftDay = (date: string, uid?: string) => post('/api/branch/shift', { action: 'close', date, uid })
// Рентабельность по товару за период.
export const productProfit = (from: string, to: string, uid?: string) => getOne<any>(`/api/branch/profit?from=${from}&to=${to}${uid ? `&uid=${uid}` : ''}`)
export const createClientOrder = (body: any, uid?: string) => post(`/api/client/orders${uid ? `?uid=${uid}` : ''}`, body)
// Документы кабинета контрагента: { purchases, sales, returns } + приём.
export const clientDocs = (uid?: string) => getOne<{ purchases: any[]; sales: any[]; returns: any[] }>(`/api/client/docs${uid ? `?uid=${uid}` : ''}`)
export const acceptClientDoc = (id: string, uid?: string) => post(`/api/client/docs/${id}/accept${uid ? `?uid=${uid}` : ''}`)
export const track = (id: string) => getOne(`/api/track?id=${encodeURIComponent(id)}`)

// Касса продавца (филиал-магазин): пробить чек одним запросом — позиции + оплата.
export async function sellCheck(body: {
  uid?: string; contactId?: string; sellerId?: string; seller?: string; comment?: string; clientCode?: string
  cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string
  discountSum?: number; discountPct?: number
  positions: { productId?: string; name1c: string; oral?: string; qty: number; unit?: string; price: number; widthCm?: number; bonusCost?: number; bonusAgentId?: string }[]
}) {
  const r = await post('/api/branch/sell', body)
  return {
    ok: r.ok, error: r.error as string | undefined,
    id: r.data?.id as string | undefined, number: r.data?.number as string | undefined,
    total: r.data?.total as number | undefined, debt: r.data?.debt as number | undefined,
  }
}
// Производство на запас: выпуск товаров/изделий прямо на склад Нипы (без покупателя и оплаты).
export async function produceStock(body: { uid?: string; items: { name?: string; color?: string; cm?: number | string; qty: number | string; productId?: string | null }[] }) {
  const r = await post('/api/branch/produce-stock', body)
  return { ok: r.ok, error: r.error as string | undefined, number: r.data?.number as string | undefined, produced: r.data?.produced as number | undefined }
}

// Касса магазина: правка пробитого чека (кол-во/цена/позиции/счета оплаты).
export async function editCheck(body: {
  uid?: string; cardId: string
  positions: { posId?: string; productId?: string; name1c: string; qty: number; unit?: string; price: number; widthCm?: number }[]
  cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string
  discountSum?: number; discountPct?: number; contactId?: string
}) {
  const r = await post('/api/branch/check', body)
  return { ok: r.ok, error: r.error as string | undefined, number: r.data?.number as string | undefined, total: r.data?.total as number | undefined, debt: r.data?.debt as number | undefined }
}
// Кабинет мастера: отправить выполненный заказ сразу головному (цепочка накладных, без логиста).
export const sendToHq = (cardId: string, date?: string) => post(`/api/orders/${cardId}/tohq`, date ? { date } : {})

// «Прочий доход»: деньги без товара (приход по счетам + бонус 50/50 с головным).
export async function otherIncome(body: { uid?: string; contactId?: string; cash?: number; kaspi?: number; qr?: number; comment?: string; seller?: string }) {
  const r = await post('/api/branch/other-income', body)
  return { ok: r.ok && r.data?.ok !== false, error: (r.data?.error || r.error) as string | undefined, sum: r.data?.sum as number | undefined, hqShare: r.data?.hqShare as number | undefined, ourShare: r.data?.ourShare as number | undefined }
}

// Прочие доходы за день (деньги без товара) — для журнала чеков магазина.
export async function otherIncomeDay(date: string, uid?: string) {
  return getObj(`/api/branch/other-income?date=${date}${uid ? `&uid=${uid}` : ''}`, { rows: [], total: 0 } as any)
}
