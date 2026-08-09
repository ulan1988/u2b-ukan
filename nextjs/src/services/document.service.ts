// Бизнес-логика документов. Про HTTP не знает.
import { randomUUID } from 'crypto'
import type { CreatePurchaseInput, CreateSaleInput } from '../dto/document.dto'
import type { CreateProductionInput } from '../dto/production.dto'
import * as docRepo from '../repositories/document.repo'
import { docNumber, today, invoiceNumber } from '../lib/num'

// Создать приходную накладную (закуп): проводка = документ + строки + приход склада.
// Долг перед поставщиком не храним — он считается из документов и оплат.
export async function createPurchase(input: CreatePurchaseInput & { number?: string }) {
  const docId = randomUUID()
  const date = input.date || today()
  // Номер приходной: порядковый за день + дата (01-060826). Дата = день приёмки логистом.
  const seq = (await docRepo.countByTypeAndDate(input.orgId, 'purchase', date)) + 1
  // Номер накладной = порядковый + номер карточки-основания (чтобы не терять связь с карточкой).
  const srcCard = (input as any).sourceOrderId
  const autoNumber = srcCard ? `${String(seq).padStart(2, '0')}-${srcCard}` : invoiceNumber(seq, date)

  let total = 0
  const lines = input.lines.map((l: any) => {
    const amount = l.qty * l.price
    total += amount
    return {
      id: randomUUID(), documentId: docId, productId: l.productId, role: 'main',
      qty: String(l.qty), unit: l.unit || 'шт', price: String(l.price), amount: String(amount),
    }
  })

  // Приход на склад: +qty по каждой строке.
  const moves = input.lines.map(l => ({
    id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId,
    productId: l.productId, qty: String(l.qty), documentId: docId, date,
  }))

  const doc = {
    id: docId, orgId: input.orgId, type: 'purchase', operation: 'receipt',
    number: input.number || autoNumber,                     // авто: 01-060826 (порядковый-дата), редактируется в форме
    sourceOrderId: (input as any).sourceOrderId || null,    // id карточки-основания (ЗП-…), чтобы связь не терялась
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '',
  }

  await docRepo.insertDocumentPosting(doc, lines, moves)
  return { id: docId, number: doc.number, total }
}

export const listPurchases = (orgId: string) => docRepo.listInvoices(orgId, 'purchase')

// Полный документ для формы накладной: шапка + строки (с именем товара) + контрагент/склад.
export async function getDocument(id: string) {
  const [doc] = await docRepo.getDoc(id)
  if (!doc) return null
  const lines = await docRepo.linesWithProduct(id)
  const [contragent] = doc.contragentId ? await docRepo.contragentById(doc.contragentId) : [null]
  const [warehouse] = doc.warehouseId ? await docRepo.warehouseById(doc.warehouseId) : [null]
  return { doc, lines, contragent: contragent || null, warehouse: warehouse || null }
}

// Правка накладной: «бумажные» поля шапки + цена/ед./коммент строк (кол-во/склад — отдельно).
// Пересчитывает суммы строк, подытог, скидку (по % или сумме) и итог.
export async function updateDocument(id: string, patch: any) {
  if (Array.isArray(patch.lines)) {
    for (const l of patch.lines) {
      if (!l.id) continue
      const set: any = {}
      if (l.price !== undefined) set.price = String(Number(l.price) || 0)
      if (l.unit !== undefined) set.unit = l.unit
      if (l.comment !== undefined) set.comment = l.comment
      if (Object.keys(set).length) await docRepo.updateLine(l.id, set)
    }
  }
  // Пересчёт сумм строк и подытога.
  const lines = await docRepo.linesWithProduct(id)
  let subtotal = 0
  for (const ln of lines) {
    const amount = Number(ln.qty) * Number(ln.price)
    if (String(amount) !== String(ln.amount)) await docRepo.updateLine(ln.id, { amount: String(amount) })
    subtotal += amount
  }
  // Шапка.
  const head: any = {}
  if (patch.number !== undefined && String(patch.number).trim()) head.number = String(patch.number).trim()
  if (patch.date !== undefined && patch.date) head.date = patch.date
  if (patch.inNumber !== undefined) head.inNumber = patch.inNumber || null
  if (patch.inDate !== undefined) head.inDate = patch.inDate || null
  if (patch.operation !== undefined) head.operation = patch.operation
  if (patch.reviewed !== undefined) head.reviewed = !!patch.reviewed
  if (patch.comment !== undefined) head.comment = patch.comment
  if (patch.paidSum !== undefined) head.paidSum = String(Number(patch.paidSum) || 0)
  // Скидка: приоритет у процента (считаем сумму), иначе берём сумму (считаем процент).
  let discountSum = Number((await docRepo.getDoc(id))[0]?.discountSum || 0)
  if (patch.discountPct !== undefined) {
    const pct = Number(patch.discountPct) || 0
    discountSum = Math.round(subtotal * pct) / 100
    head.discountPct = String(pct); head.discountSum = String(discountSum)
  } else if (patch.discountSum !== undefined) {
    discountSum = Number(patch.discountSum) || 0
    head.discountSum = String(discountSum)
    head.discountPct = subtotal > 0 ? String(Math.round(discountSum / subtotal * 10000) / 100) : '0'
  }
  head.total = String(Math.max(0, subtotal - discountSum))
  await docRepo.updateDoc(id, head)
  return { ok: true, subtotal, discountSum, total: subtotal - discountSum }
}

// Создать расходную накладную (продажа): проводка = документ + строки +
// РАСХОД склада (stock_movement −). Долг заказчика считается из документов и оплат.
export async function createSale(input: CreateSaleInput & { number?: string }) {
  const docId = randomUUID()
  const date = input.date || today()
  // Номер расходной: порядковый за день + дата (01-080826), как у приходной.
  // Отдельный счётчик от приходных. Дата = день отгрузки/доставки. Карточка (ПР-…) — основание.
  const seq = (await docRepo.countByTypeAndDate(input.orgId, 'sale', date)) + 1
  // Номер накладной = порядковый + номер карточки-основания (чтобы не терять связь с карточкой).
  const srcCard = (input as any).sourceOrderId
  const autoNumber = srcCard ? `${String(seq).padStart(2, '0')}-${srcCard}` : invoiceNumber(seq, date)

  let total = 0
  const lines = input.lines.map((l: any) => {
    const amount = l.qty * l.price
    total += amount
    return {
      id: randomUUID(), documentId: docId, productId: l.productId, role: 'main',
      qty: String(l.qty), unit: l.unit || 'шт', price: String(l.price), amount: String(amount),
    }
  })

  // Списание со склада: −qty по каждой строке.
  const moves = input.lines.map(l => ({
    id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId,
    productId: l.productId, qty: String(-l.qty), documentId: docId, date,
  }))

  // FIFO: связываем продажу с партиями закупа (для себестоимости/маржи и цепочки).
  const links: { id: string; purchaseDocId: string; saleDocId: string; productId: string; qty: string }[] = []
  for (const l of input.lines) {
    let need = l.qty
    const lots = await docRepo.purchaseLots(input.orgId, l.productId)   // старые первыми
    for (const lot of lots) {
      if (need <= 0.0001) break
      const remaining = lot.line_qty - lot.linked_qty
      if (remaining <= 0.0001) continue
      const take = Math.min(remaining, need)
      links.push({ id: randomUUID(), purchaseDocId: lot.purchase_doc_id, saleDocId: docId, productId: l.productId, qty: String(take) })
      need -= take
    }
    // если need>0 — продали больше, чем закуплено; остаток без связи (в отчёте — по priceIn).
  }

  const doc = {
    id: docId, orgId: input.orgId, type: 'sale', operation: 'shipment',
    number: input.number || autoNumber,                    // авто: 01-080826 (порядковый-дата), редактируется в форме
    sourceOrderId: (input as any).sourceOrderId || null,   // id карточки-основания (ПР-…), чтобы связь не терялась
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '',
  }

  await docRepo.insertDocumentPosting(doc, lines, moves, links)
  return { id: docId, number: doc.number, total }
}

export const listSales = (orgId: string) => docRepo.listInvoices(orgId, 'sale')

// Возврат: return_in = от покупателя (+склад, −долг заказчика);
// return_out = поставщику (−склад, −наш долг). Проводка = документ + строки + движение.
export async function createReturn(input: CreateSaleInput, kind: 'return_in' | 'return_out') {
  const count = await docRepo.countByType(input.orgId, kind)
  const docId = randomUUID()
  const date = input.date || today()
  const sign = kind === 'return_in' ? 1 : -1   // товар возвращается на склад (+) или уходит (−)

  let total = 0
  const lines = input.lines.map(l => {
    const amount = l.qty * l.price
    total += amount
    return { id: randomUUID(), documentId: docId, productId: l.productId, role: 'main', qty: String(l.qty), price: String(l.price), amount: String(amount) }
  })
  const moves = input.lines.map(l => ({
    id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId,
    productId: l.productId, qty: String(sign * l.qty), documentId: docId, date,
  }))
  const doc = {
    id: docId, orgId: input.orgId, type: kind, number: docNumber(kind, count),
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '',
  }
  await docRepo.insertDocumentPosting(doc, lines, moves)
  return { id: docId, number: doc.number, total }
}

export const listReturns = (orgId: string) => docRepo.listByTypes(orgId, ['return_in', 'return_out'])

// Производство: сырьё (input) списывается со склада, готовый товар (output)
// приходуется. Готовый товар — размерное ценообразование: (см×см)/10000=м² × ставка × кол-во.
export async function createProduction(input: CreateProductionInput) {
  const count = await docRepo.countByType(input.orgId, 'production')
  const docId = randomUUID()
  const date = input.date || today()
  const lines: any[] = []
  const moves: any[] = []

  // Сырьё → role input, списание склада (−)
  for (const l of input.inputs) {
    lines.push({ id: randomUUID(), documentId: docId, productId: l.productId, role: 'input', qty: String(l.qty), price: String(l.price), amount: String(l.qty * l.price) })
    moves.push({ id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId, productId: l.productId, qty: String(-l.qty), documentId: docId, date })
  }
  // Готовый товар → role output, приход склада (+), размерное ценообразование
  let total = 0
  for (const l of input.outputs) {
    const area = (l.lengthCm && l.widthCm) ? (l.lengthCm * l.widthCm) / 10000 : null
    const amount = (area != null && l.rate) ? area * l.rate * l.qty : l.qty * (l.price || 0)
    total += amount
    lines.push({
      id: randomUUID(), documentId: docId, productId: l.productId, role: 'output',
      qty: String(l.qty), price: String(l.qty > 0 ? amount / l.qty : 0), amount: String(amount),
      lengthCm: l.lengthCm != null ? String(l.lengthCm) : null,
      widthCm: l.widthCm != null ? String(l.widthCm) : null,
      areaM2: area != null ? String(area) : null,
      rate: l.rate != null ? String(l.rate) : null,
    })
    moves.push({ id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId, productId: l.productId, qty: String(l.qty), documentId: docId, date })
  }

  const doc = {
    id: docId, orgId: input.orgId, type: 'production', number: docNumber('production', count),
    warehouseId: input.warehouseId, date, status: 'posted', total: String(total), comment: input.comment || '',
  }
  await docRepo.insertDocumentPosting(doc, lines, moves)
  return { id: docId, number: doc.number, total }
}

export const listProduction = (orgId: string) => docRepo.listByType(orgId, 'production')

// Сторно (отмена/удаление) документа — откатывает склад и связи, статус cancelled.
export async function cancelDocument(docId: string) {
  await docRepo.cancelDocument(docId)
  return { ok: true }
}
