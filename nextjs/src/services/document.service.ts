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

  const doc = {
    id: docId, orgId: input.orgId, type: 'sale',
    number: docNumber('sale', count),
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '',
  }

  await docRepo.insertDocumentPosting(doc, lines, moves)
  return { id: docId, number: doc.number, total }
}

export const listSales = (orgId: string) => docRepo.listByType(orgId, 'sale')
