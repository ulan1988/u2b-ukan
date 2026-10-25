// Бухгалтерия → печатные документы (счёт / накладная / акт / КП): бизнес-логика.
import * as repo from '../repositories/accDocs.repo'
import { documentCreateSchema, computeItems, amountInWordsKzt, nextDocNumber, type DocType } from '../dto/accDocs.dto'

const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)
const DOC_LABEL: Record<string, string> = {
  invoice: 'Счет на оплату', nakladnaya: 'Накладная', akt: 'Акт выполненных работ', kp: 'Коммерческое предложение',
}
const TEXT_FIELDS = ['companyName', 'companyFull', 'bin', 'address', 'phone', 'directorName', 'banks'] as const
const IMG_FIELDS = ['logoB64', 'stampB64', 'signB64'] as const
const TPL_FIELDS = ['invoiceTemplateB64', 'naklTemplateB64', 'aktTemplateB64', 'kpTemplateB64'] as const

export const listDocs = (orgId: string) => repo.listDocs(orgId)
export const removeDoc = (id: string) => repo.removeDoc(id)

export async function nextNumber(orgId: string, type: DocType) {
  const nums = await repo.numbersOf(orgId, type)
  return nextDocNumber(type, nums.map(n => n.number))
}

export async function createDoc(orgId: string, input: unknown, actor?: { id?: string; name?: string } | null) {
  const data = documentCreateSchema.parse(input)
  const { rows, total } = computeItems(data.items)
  const number = await nextNumber(orgId, data.type)
  return repo.createDoc({
    orgId, type: data.type, number, docNo: `${DOC_LABEL[data.type]} № ${number}`,
    docDate: data.docDate || new Date().toISOString().slice(0, 10),
    buyerName: data.buyerName, buyerBin: data.buyerBin || null, buyerAddress: data.buyerAddress || null,
    buyerRequisites: data.buyerRequisites || null, bank: data.bank || null,
    items: rows.map(r => ({ name: r.name, sku: (r.sku as string) || null, qty: r.qty, unit: (r.unit as string) || 'шт', price: r.price, sum: r.sum })),
    total: money(total), amountWords: amountInWordsKzt(total),
    withStamp: data.withStamp, withSign: data.withSign, comment: data.comment || null,
    createdBy: actor?.id || null, createdByName: actor?.name || null,
  })
}

// Документ + реквизиты организации — для генераторов файлов.
export async function docWithOrg(id: string) {
  const doc = await repo.findDoc(id)
  if (!doc) return null
  const org = (await repo.getSettings(doc.orgId)) || {}
  return { doc, org }
}

// Реквизиты для экрана: картинки отдаём (превью), ГОСТ-шаблоны — только флагом «загружен» (они тяжёлые).
export async function getOrgSettings(orgId: string) {
  const s: any = (await repo.getSettings(orgId)) || {}
  const out: any = { orgId }
  for (const k of TEXT_FIELDS) out[k] = s[k] ?? (k === 'banks' ? [] : '')
  for (const k of IMG_FIELDS) out[k] = s[k] || ''
  out.templates = Object.fromEntries(TPL_FIELDS.map(k => [k, !!s[k]]))
  return out
}

export async function updateOrgSettings(orgId: string, input: any) {
  const patch: Record<string, unknown> = {}
  for (const k of TEXT_FIELDS) if (input?.[k] !== undefined) patch[k] = input[k]
  for (const k of IMG_FIELDS) if (input?.[k] !== undefined) patch[k] = input[k] || null
  for (const k of TPL_FIELDS) if (input?.[k] !== undefined) patch[k] = input[k] ? String(input[k]).replace(/^data:[^,]*;base64,/, '') : null
  await repo.upsertSettings(orgId, patch as any)
  return { ok: true }
}
