// Бизнес-логика документов. Про HTTP не знает.
import { randomUUID } from 'crypto'
import type { CreatePurchaseInput, CreateSaleInput } from '../dto/document.dto'
import type { CreateProductionInput } from '../dto/production.dto'
import * as docRepo from '../repositories/document.repo'
import { docNumber, today } from '../lib/num'

// Создать приходную накладную (закуп): проводка = документ + строки + приход склада.
// Долг перед поставщиком не храним — он считается из документов и оплат.
export async function createPurchase(input: CreatePurchaseInput) {
  const count = await docRepo.countByType(input.orgId, 'purchase')
  const docId = randomUUID()
  const date = input.date || today()

  let total = 0
  const lines = input.lines.map(l => {
    const amount = l.qty * l.price
    total += amount
    return {
      id: randomUUID(), documentId: docId, productId: l.productId, role: 'main',
      qty: String(l.qty), price: String(l.price), amount: String(amount),
    }
  })

  // Приход на склад: +qty по каждой строке.
  const moves = input.lines.map(l => ({
    id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId,
    productId: l.productId, qty: String(l.qty), documentId: docId, date,
  }))

  const doc = {
    id: docId, orgId: input.orgId, type: 'purchase',
    number: docNumber('purchase', count),
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '',
  }

  await docRepo.insertDocumentPosting(doc, lines, moves)
  return { id: docId, number: doc.number, total }
}

export const listPurchases = (orgId: string) => docRepo.listByType(orgId, 'purchase')

// Создать расходную накладную (продажа): проводка = документ + строки +
// РАСХОД склада (stock_movement −). Долг заказчика считается из документов и оплат.
export async function createSale(input: CreateSaleInput) {
  const count = await docRepo.countByType(input.orgId, 'sale')
  const docId = randomUUID()
  const date = input.date || today()

  let total = 0
  const lines = input.lines.map(l => {
    const amount = l.qty * l.price
    total += amount
    return {
      id: randomUUID(), documentId: docId, productId: l.productId, role: 'main',
      qty: String(l.qty), price: String(l.price), amount: String(amount),
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
    id: docId, orgId: input.orgId, type: 'sale',
    number: docNumber('sale', count),
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '',
  }

  await docRepo.insertDocumentPosting(doc, lines, moves, links)
  return { id: docId, number: doc.number, total }
}

export const listSales = (orgId: string) => docRepo.listByType(orgId, 'sale')

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
