// Бизнес-логика документов. Про HTTP не знает.
import { randomUUID } from 'crypto'
import type { CreatePurchaseInput, CreateSaleInput } from '../dto/document.dto'
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

// Сторно (отмена) документа — откатывает склад и связи, статус cancelled.
export async function cancelDocument(docId: string) {
  await docRepo.cancelDocument(docId)
  return { ok: true }
}
