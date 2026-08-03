import { randomUUID } from 'crypto'
import type { CreatePaymentInput } from '../dto/payment.dto'
import * as payRepo from '../repositories/payment.repo'
import { today } from '../lib/num'

// Оплата: in = деньги от клиента (гасит дебиторку), out = поставщику (гасит кредиторку).
export async function createPayment(input: CreatePaymentInput) {
  const id = randomUUID()
  await payRepo.insertPayment({
    id, orgId: input.orgId, contragentId: input.contragentId,
    direction: input.direction, amount: String(input.amount),
    date: input.date || today(), cashAccountId: input.cashAccountId || null,
    comment: input.comment || '',
  })
  return { id }
}

export const listPayments = (orgId: string) => payRepo.listByOrg(orgId)
