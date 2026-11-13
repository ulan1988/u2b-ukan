// Бизнес-логика документов. Про HTTP не знает.
import { randomUUID } from 'crypto'
import type { CreatePurchaseInput, CreateSaleInput } from '../dto/document.dto'
import type { CreateProductionInput } from '../dto/production.dto'
import * as docRepo from '../repositories/document.repo'
import { docNumber, today, invoiceNumber } from '../lib/num'
import { lineAmount } from '../lib/lineAmount'

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
    // Сумма строки: вписанная руками (накладная поставщика «в суммах») или кол-во×цена.
    const amount = l.amount != null && Number(l.amount) >= 0 ? Math.round(Number(l.amount) * 100) / 100
      : lineAmount({ name: l.name, qty: l.qty, price: l.price, widthCm: l.widthCm })  // изделие: кол-во×см×цена
    total += amount
    return {
      id: randomUUID(), documentId: docId, productId: l.productId, role: 'main',
      sourcePosId: l.sourcePosId || null,
      qty: String(l.qty), unit: l.unit || 'шт', price: String(l.price), amount: String(amount),
      widthCm: l.widthCm != null ? String(l.widthCm) : null,
      // Имя как в накладной: собранный по цвету/размеру товар («Нар. угол (пр) дерево»),
      // тогда как карточка товара — базовая безцветная. Пусто → покажем имя товара.
      name: l.name || null,
      comment: l.comment || '', block: l.block || '',   // коммент строки и блок (накладная поставщика)
    }
  })

  // Приход на склад: +qty по каждой строке. Сквозная (noStock) — склад НЕ трогаем.
  const moves = input.lines.filter((l: any) => !((input as any).noStock || l.transit)).map((l: any) => ({
    id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId,
    productId: l.productId, qty: String(l.qty), documentId: docId, date,
  }))

  // Скидка накладной (как в форме): % → сумма, итог = Σ строк − скидка.
  const discPct = Number((input as any).discountPct) || 0
  const discIn = Math.max(0, Math.min(discPct > 0 ? Math.round(total * discPct) / 100 : (Number((input as any).discountSum) || 0), total))
  total = Math.round((total - discIn) * 100) / 100
  const doc = {
    id: docId, orgId: input.orgId, type: 'purchase', operation: 'receipt',
    number: input.number || autoNumber,                     // авто: 01-060826 (порядковый-дата), редактируется в форме
    sourceOrderId: (input as any).sourceOrderId || null,    // id карточки-основания (ЗП-…), чтобы связь не терялась
    parentDocId: (input as any).parentDocId || null,
    originDocId: (input as any).originDocId || null,   // накладная-основание (приход → отгрузка получателю)        // мать-накладная (зеркало филиала ← наша расходная)
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '', projectId: (input as any).projectId || null, transit: (input as any).noStock || (input as any).transit || false,
    // Бумажные поля из формы накладной: № и дата документа поставщика, операция, скидка, оплата.
    ...((input as any).inNumber ? { inNumber: (input as any).inNumber } : {}),
    ...((input as any).inDate ? { inDate: (input as any).inDate } : {}),
    ...((input as any).operation ? { operation: (input as any).operation } : {}),
    ...((input as any).paidSum != null ? { paidSum: String(Number((input as any).paidSum) || 0) } : {}),
    discountPct: String(discPct), discountSum: String(discIn),
    ...((input as any).createdAt ? { createdAt: (input as any).createdAt } : {}),
  }

  await docRepo.insertDocumentPosting(doc, lines, moves)
  // Ф2: приход листов → склад материала (единый лист, 0,35→0,4). Цена остаётся в документе.
  try { const { receiveSheetsFromLines } = await import('./material.service'); await receiveSheetsFromLines(input.orgId, input.warehouseId, lines.map(l => ({ productId: l.productId, qty: l.qty }))) } catch {}
  await mirrorBetweenOrgs(input, { id: docId, number: doc.number }, 'purchase')
  // ДОМИНО ПРИХОДА: в приходной указан ПОЛУЧАТЕЛЬ — товар на складе не задерживается,
  // сразу уходит ему расходной ТОЙ ЖЕ ДАТОЙ. Получатель-филиал увидит свою приходную
  // зеркалом (тем же днём, с ценой).
  if ((input as any).recipientId) await shipToRecipient(input, { id: docId, number: doc.number })
  return { id: docId, number: doc.number, total }
}

// Отгрузка получателю прямо из приходной (приход → расход одним действием).
// Цена — ТА ЖЕ, что при обычной продаже: тип цены контрагента (спец/опт/розница) поверх
// прайса своей орг (`product_prices`). Цены продажи у орг нет (0) — берём цену прихода,
// иначе отгрузили бы за 0.
async function shipToRecipient(input: any, doc: { id: string; number: string }) {
  try {
    const recipientId = String(input.recipientId)
    if (!recipientId || recipientId === input.contragentId) return
    const [rc] = await docRepo.contragentById(recipientId)
    if (!rc) return
    const priceType = (rc as any).priceType || 'retail'
    const refsRepo = await import('../repositories/refs.repo')
    const ids = Array.from(new Set((input.lines || []).map((l: any) => l.productId).filter(Boolean))) as string[]
    const prods = await refsRepo.productsWithOrgPrices(input.orgId, ids)
    const byId = new Map(prods.map((p: any) => [p.id, p]))
    const { priceForClient } = await import('../lib/lineAmount')
    const lines = (input.lines || []).map((l: any) => {
      const p = l.productId ? byId.get(l.productId) : null
      const sale = p ? priceForClient(p, priceType) : 0
      return { ...l, sourcePosId: null, price: sale > 0 ? sale : Number(l.price) || 0 }
    })
    await createSale({
      orgId: input.orgId, contragentId: recipientId, warehouseId: input.warehouseId,
      lines, date: input.date, comment: `Отгрузка получателю по приходной ${doc.number}`,
      originDocId: doc.id,   // связь приход → отгрузка: по ней домино переносит дату всей цепочке
    } as any)
  } catch (e) { console.error('shipToRecipient', doc.number, e) }
}

// ── ЗЕРКАЛО МЕЖ ОРГ (накладная, заведённая руками) ──────────────────────────────
// Поставщик/покупатель документа — мост на другую орг (contragents.org_ref_id)?
// Значит это движение МЕЖДУ нашими орг: у второй стороны заводим противоположную
// накладную ТОЙ ЖЕ ДАТОЙ (приход у филиала ⇄ расход у головного), чтобы задним числом
// сошлись обе книги и отчёты. Зеркало не зеркалит само себя (noMirror).
async function mirrorBetweenOrgs(input: any, doc: { id: string; number: string }, kind: 'purchase' | 'sale') {
  // Накладная из КАРТОЧКИ (sourceOrderId) зеркалится своим механизмом в invoice.service —
  // второй раз здесь нельзя, иначе у второй орг будет две накладные.
  if ((input as any).noMirror || (input as any).parentDocId || (input as any).sourceOrderId) return
  try {
    const [cp] = await docRepo.contragentById(input.contragentId)
    const refOrg = (cp as any)?.orgRefId as string | undefined
    if (!refOrg || refOrg === input.orgId) return
    const refsRepo = await import('../repositories/refs.repo')
    const mwh = await refsRepo.centralWarehouse(refOrg)
    const [back] = await docRepo.contragentByOrgRef(refOrg, input.orgId)   // в книге второй орг — контрагент «наша орг»
    if (!mwh || !back) return
    const mlines = (input.lines || []).map((l: any) => ({ ...l, sourcePosId: null }))
    const minput: any = {
      orgId: refOrg, contragentId: back.id, warehouseId: mwh.id, lines: mlines,
      date: input.date, parentDocId: doc.id, noMirror: true,
      // Порядок по времени: сначала отгрузил ЦЕНТРАЛЬНЫЙ склад, потом принял филиал.
      // Время берём от САМОГО документа (не от часов приложения — они могут расходиться
      // с базой) и отнимаем 2 секунды, чтобы отгрузка всегда шла первой.
      comment: `Зеркало ${kind === 'purchase' ? 'прихода' : 'расхода'} ${doc.number}`,
    }
    // Приход у нас → расход у них, и наоборот.
    const mdoc = kind === 'purchase' ? await createSale(minput) : await createPurchase(minput)
    // Порядок по времени: сначала отгрузил ЦЕНТРАЛЬНЫЙ склад, потом принял филиал.
    // Сдвигаем время зеркала прямо в SQL (JS-дата ломала бы часовой пояс).
    if (kind === 'purchase') {
      const { sqlClient } = await import('../lib/db')
      await sqlClient`update documents set created_at = (select created_at from documents where id=${doc.id}) - interval '2 seconds' where id=${mdoc.id}`
    }
  } catch (e) { console.error('mirrorBetweenOrgs', doc.number, e) }
}

// ЦЕПОЧКА НАКЛАДНОЙ (домино): всё, что связано с документом — мать-зеркало и накладная-
// основание (вверх), зеркала филиалов и отгрузка получателю (вниз). Начинаем с любого
// звена: поднимаемся к корню, потом собираем всё дерево. Себя в список не включаем.
async function chainDocs(docId: string) {
  let rootId = docId
  for (let i = 0; i < 10; i++) {                      // защита от кольца
    const [d] = await docRepo.getDoc(rootId); if (!d) break
    const up = (d as any).parentDocId || (d as any).originDocId
    if (!up || up === rootId) break
    rootId = up
  }
  const seen = new Set<string>([rootId])
  const out: Array<{ id: string; number: string }> = []
  if (rootId !== docId) { const [r] = await docRepo.getDoc(rootId); if (r) out.push({ id: r.id, number: r.number }) }
  const walk = async (pid: string) => {
    for (const c of await docRepo.docsBornFrom(pid)) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      if (c.id !== docId) out.push({ id: c.id, number: c.number })
      await walk(c.id)
    }
  }
  await walk(rootId)
  return out
}

// Отменить всю ветку зеркал под накладной: зеркальная приходная другой орг и всё,
// что из неё родилось (её расходная на конечного клиента). Используется при смене
// покупателя: товар к головному не ушёл — цепочка у него должна сторнироваться.
async function cancelMirrorBranch(docId: string, out: string[] = []): Promise<string[]> {
  for (const c of await docRepo.childDocs(docId)) {
    await cancelMirrorBranch(c.id, out)
    if (c.status !== 'cancelled') { try { await cancelDocument(c.id); out.push(c.number) } catch (e) { console.error('cancel branch', c.id, e) } }
  }
  return out
}

// Накладные + ДЕРЕВО карточек: к каждой строке добавляем корень дерева (мать ЗКП) и все id
// ветки. Благодаря этому фильтры и поиск канбана «в курсе» связи: ищешь по ЗКП — находятся
// и приходная закупа, и расходная дочерней продажи ПРД, и наоборот.
async function withCardTree(rows: any[]) {
  const ids = Array.from(new Set(rows.map(r => r.sourceOrderId).filter(Boolean))) as string[]
  if (!ids.length) return rows
  const orderRepo = await import('../repositories/order.repo')
  const trees = await orderRepo.cardTrees(ids)
  return rows.map(r => {
    const t = r.sourceOrderId ? trees[r.sourceOrderId] : null
    if (!t) return r
    // treeRoot показываем, только когда ветка реально из нескольких карточек (ЗКП + ПРД).
    return { ...r, cardTree: t.ids.join(' '), treeRoot: t.ids.length > 1 ? t.root : null }
  })
}

export const listPurchases = async (orgId: string) => withCardTree(await docRepo.listInvoices(orgId, 'purchase'))

// Полный документ для формы накладной: шапка + строки (с именем товара) + контрагент/склад.
export async function getDocument(id: string) {
  const [doc] = await docRepo.getDoc(id)
  if (!doc) return null
  const lines = await docRepo.linesWithProduct(id)
  const [contragent] = doc.contragentId ? await docRepo.contragentById(doc.contragentId) : [null]
  const [warehouse] = doc.warehouseId ? await docRepo.warehouseById(doc.warehouseId) : [null]
  // Заказчик (конечный клиент): из карточки-основания (sourceOrderId → order.contactId).
  // Нужен на приходной-зеркале головного (Нипа-поставщик → для какого заказчика, на кого долг).
  let customer: string | null = null
  if (doc.type === 'sale' && doc.sourceOrderId) {
    const orderRepo = await import('../repositories/order.repo')
    const [ord] = await orderRepo.getOrder(doc.sourceOrderId)
    if (ord?.contactId) { const [c] = await docRepo.contragentById(ord.contactId); customer = c?.name || null }
  } else if (doc.type === 'purchase') {
    // Приходная: заказчик(и) = клиенты продаж, под которые закуплено (doc_links).
    customer = (await docRepo.linkedSaleCustomers(id)) || null
  }
  // Себестоимость продажи (связанные приходные + непокрытое×price_in) — верная, как в рентабельности.
  const cost = doc.type === 'sale' ? await docRepo.docCost(id) : 0
  // Поставщик расходной: явный (документ) → иначе тот же вывод, что в списке накладных.
  let supplier: string | null = null
  if (doc.type === 'sale') {
    if ((doc as any).supplierId) { const [sp] = await docRepo.contragentById((doc as any).supplierId); supplier = sp?.name || null }
    else supplier = (await docRepo.saleSupplierFallback(id)) || null
  }
  // Дочерние накладные филиалов (дерево parent_doc_id) — для кнопки «Применить всем».
  const children = await docRepo.childDocsWithOrg(id)
  const history = await docRepo.listDocHistory(id)
  return { doc, lines, contragent: contragent || null, warehouse: warehouse || null, customer, supplier, cost, children, history }
}

// Правка накладной: «бумажные» поля шапки + цена/ед./коммент строк (кол-во/склад — отдельно).
// Пересчитывает суммы строк, подытог, скидку (по % или сумме) и итог.
export async function updateDocument(id: string, patch: any, actor?: { name?: string } | null) {
  // «Было» для журнала правок — снимаем ДО изменений (строки и шапка).
  const before = await docRepo.linesWithProduct(id)
  const [headBefore] = await docRepo.getDoc(id)
  if (Array.isArray(patch.lines)) {
    for (const l of patch.lines) {
      if (!l.id) continue
      const set: any = {}
      if (l.price !== undefined) set.price = String(Number(l.price) || 0)
      if (l.unit !== undefined) set.unit = l.unit
      if (l.comment !== undefined) set.comment = l.comment
      if (l.block !== undefined) set.block = String(l.block || '')                 // блок (накладная поставщика)
      if (l.sortOrder !== undefined) set.sortOrder = Number(l.sortOrder) || 0       // порядок (перетаскивание)
      if (l.amount !== undefined) set.amount = String(Math.round((Number(l.amount) || 0) * 100) / 100)   // сумма «как в накладной завода»
      if (Object.keys(set).length) await docRepo.updateLine(l.id, set)
    }
  }
  // Пересчёт сумм строк и подытога.
  const lines = await docRepo.linesWithProduct(id)
  let subtotal = 0
  // Сумму НЕ пересчитываем, если её прислали руками (накладная поставщика «в суммах») —
  // иначе итог разъедется с бумагой на копейки.
  const manual = new Map<string, number>((Array.isArray(patch.lines) ? patch.lines : []).filter((l: any) => l.id && l.amount !== undefined).map((l: any) => [String(l.id), Math.round((Number(l.amount) || 0) * 100) / 100]))
  for (const ln of lines) {
    const amount = manual.has(ln.id) ? (manual.get(ln.id) as number)
      : lineAmount({ name: (ln as any).name, qty: ln.qty, price: ln.price, widthCm: (ln as any).widthCm })
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
  // Контрагент накладной (покупатель у расходной, поставщик у приходной) — правка ошибки
  // выбора. Долг идёт за контрагентом документа, поэтому смена переносит и долг.
  // Смена покупателя расходной: если раньше стоял МОСТ на нашу другую орг (продавали
  // головному), а теперь обычный клиент — значит товар к головному не поехал. Его цепочку
  // (зеркальная приходная + её расходная клиенту) сторнируем, иначе у него висит чужой долг.
  let rolledBack: string[] = []
  if (patch.contragentId && headBefore?.type === 'sale' && String(patch.contragentId) !== String(headBefore.contragentId || '')) {
    const [wasCg] = await docRepo.contragentById(headBefore.contragentId as string)
    const [nowCg] = await docRepo.contragentById(String(patch.contragentId))
    if ((wasCg as any)?.orgRefId && !(nowCg as any)?.orgRefId) rolledBack = await cancelMirrorBranch(id)
  }
  if (patch.contragentId) head.contragentId = String(patch.contragentId)
  // Поставщик расходной (у кого взят товар). Пусто → очищаем, снова выводится из связей.
  if (patch.supplierId !== undefined) head.supplierId = patch.supplierId ? String(patch.supplierId) : null
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
  // ДОМИНО ДАТЫ: день накладной тянет за собой её движения склада И зеркальные накладные
  // филиалов. Головной перенёс документ задним числом — филиал должен приходовать тем же
  // днём, иначе остатки и отчёты двух орг разъедутся по дням.
  const dateMoved: string[] = []
  if (head.date && headBefore && String(head.date) !== String(headBefore.date).slice(0, 10)) {
    await docRepo.setMovementsDate(id, head.date)
    const was = String(headBefore.date).slice(0, 10)
    for (const ch of await chainDocs(id)) {
      await docRepo.updateDoc(ch.id, { date: head.date } as any)
      await docRepo.setMovementsDate(ch.id, head.date)
      await docRepo.insertDocHistory({ documentId: ch.id, action: 'edit', detail: `дата по цепочке: ${was} → ${head.date}`, userName: actor?.name || 'Система' } as any)
      dateMoved.push(ch.number)
    }
  }
  // Журнал: что реально изменилось (кол-во/цена строк и ключевые поля шапки).
  const after = await docRepo.linesWithProduct(id)
  const changes: string[] = []
  const was = new Map(before.map(l => [l.id, l]))
  for (const l of after) {
    const b = was.get(l.id); if (!b) { changes.push(`+ ${(l as any).name}`); continue }
    if (String(b.qty) !== String(l.qty)) changes.push(`${(l as any).name}: кол-во ${Number(b.qty)} → ${Number(l.qty)}`)
    if (String(b.price) !== String(l.price)) changes.push(`${(l as any).name}: цена ${Number(b.price)} → ${Number(l.price)}`)
  }
  for (const b of before) if (!after.some(l => l.id === b.id)) changes.push(`− ${(b as any).name}`)
  if (headBefore) {
    if (patch.contragentId && patch.contragentId !== headBefore.contragentId) changes.push('сменён контрагент')
    if (patch.supplierId !== undefined && (patch.supplierId || null) !== ((headBefore as any).supplierId || null)) changes.push('сменён поставщик')
    if (head.number && head.number !== headBefore.number) changes.push(`номер ${headBefore.number} → ${head.number}`)
    if (String(headBefore.total) !== head.total) changes.push(`итог ${Number(headBefore.total)} → ${Number(head.total)}`)
    if (head.date && String(head.date) !== String(headBefore.date).slice(0, 10)) changes.push(`дата ${String(headBefore.date).slice(0, 10)} → ${head.date}`)
  }
  if (dateMoved.length) changes.push(`дата перенесена и у филиалов: ${dateMoved.join(', ')}`)
  if (rolledBack.length) changes.push(`откат цепочки головного: ${rolledBack.join(', ')}`)
  if (changes.length) await docRepo.insertDocHistory({ documentId: id, action: 'edit', detail: changes.join(' · '), userName: actor?.name || 'Система' } as any)
  return { ok: true, subtotal, discountSum, total: subtotal - discountSum, rolledBack, dateMoved }
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
    // Сумма строки: вписанная руками (накладная поставщика «в суммах») или кол-во×цена.
    const amount = l.amount != null && Number(l.amount) >= 0 ? Math.round(Number(l.amount) * 100) / 100
      : lineAmount({ name: l.name, qty: l.qty, price: l.price, widthCm: l.widthCm })  // изделие: кол-во×см×цена
    total += amount
    return {
      id: randomUUID(), documentId: docId, productId: l.productId, role: 'main',
      sourcePosId: l.sourcePosId || null,
      qty: String(l.qty), unit: l.unit || 'шт', price: String(l.price), amount: String(amount),
      widthCm: l.widthCm != null ? String(l.widthCm) : null,
      // Имя как в накладной: собранный по цвету/размеру товар («Нар. угол (пр) дерево»),
      // тогда как карточка товара — базовая безцветная. Пусто → покажем имя товара.
      name: l.name || null,
      comment: l.comment || '', block: l.block || '',   // коммент строки и блок (накладная поставщика)
    }
  })

  // Списание со склада: −qty по каждой строке. Сквозная (noStock) — склад НЕ трогаем.
  const moves = input.lines.filter((l: any) => !((input as any).noStock || l.transit)).map((l: any) => ({
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

  // Скидка по чеку (касса): итог = Σпозиций − скидка. % — инфо, сумма (discountSum) — источник истины.
  const discPctS = Number((input as any).discountPct) || 0
  const disc = Math.max(0, Math.min(discPctS > 0 ? Math.round(total * discPctS) / 100 : (Number((input as any).discountSum) || 0), total))
  const netTotal = total - disc
  const doc = {
    id: docId, orgId: input.orgId, type: 'sale', operation: 'shipment',
    number: input.number || autoNumber,                    // авто: 01-080826 (порядковый-дата), редактируется в форме
    sourceOrderId: (input as any).sourceOrderId || null,   // id карточки-основания (ПР-…), чтобы связь не терялась
    parentDocId: (input as any).parentDocId || null,
    originDocId: (input as any).originDocId || null,   // накладная-основание (приход → отгрузка получателю)       // мать-накладная (зеркало филиала ← наша расходная)
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(netTotal),
    discountSum: String(disc), discountPct: String(disc > 0 && total > 0 ? Math.round(disc / total * 10000) / 100 : 0),
    comment: input.comment || '', projectId: (input as any).projectId || null, transit: (input as any).noStock || (input as any).transit || false,
    ...((input as any).operation ? { operation: (input as any).operation } : {}),
    ...((input as any).paidSum != null ? { paidSum: String(Number((input as any).paidSum) || 0) } : {}),
    ...((input as any).createdAt ? { createdAt: (input as any).createdAt } : {}),
  }

  await docRepo.insertDocumentPosting(doc, lines, moves, links)
  await mirrorBetweenOrgs(input, { id: docId, number: doc.number }, 'sale')
  return { id: docId, number: doc.number, total: netTotal }
}

export const listSales = async (orgId: string) => withCardTree(await docRepo.listInvoices(orgId, 'sale'))

// Удалить ОШИБОЧНУЮ позицию из проведённой накладной: убрать строку + вернуть движение склада
// (пересчитать остаток по товару) + удалить позицию карточки (для сверки отчётов) + пересчитать итог.
export async function deleteDocumentLine(docId: string, lineId: string, _actor?: any) {
  const { sqlClient } = await import('../lib/db')
  const [doc] = await sqlClient`select id, type, status, coalesce(discount_sum,0)::float ds from documents where id=${docId}` as unknown as Array<any>
  if (!doc) return { ok: false as const, error: 'Документ не найден' }
  if (doc.status === 'cancelled') return { ok: false as const, error: 'Документ отменён' }
  const lines = await sqlClient`select id, product_id, qty::float, amount::float, source_pos_id from document_lines where document_id=${docId}` as unknown as Array<any>
  if (lines.length <= 1) return { ok: false as const, error: 'Нельзя удалить последнюю позицию — отмените накладную («Вернуть»)' }
  const line = lines.find((l: any) => l.id === lineId)
  if (!line) return { ok: false as const, error: 'Позиция не найдена' }
  await sqlClient`delete from document_lines where id=${lineId}`
  // Движение склада по этому товару: пересчитать на остаток (если товар ещё в других строках) или удалить.
  const sign = (doc.type === 'sale' || doc.type === 'return_out') ? -1 : 1
  const remainQty = lines.filter((l: any) => l.id !== lineId && l.product_id === line.product_id).reduce((s: number, l: any) => s + Number(l.qty), 0)
  if (remainQty > 0) await sqlClient`update stock_movements set qty=${String(sign * remainQty)} where document_id=${docId} and product_id=${line.product_id}`
  else await sqlClient`delete from stock_movements where document_id=${docId} and product_id=${line.product_id}`
  // Позиция карточки-основания (чтобы отчёты по order_positions не задваивали удалённое).
  if (line.source_pos_id) await sqlClient`delete from order_positions where id=${line.source_pos_id}`
  // Пересчитать итог документа (− скидка).
  const newSubtotal = lines.filter((l: any) => l.id !== lineId).reduce((s: number, l: any) => s + Number(l.amount), 0)
  const newTotal = Math.max(0, newSubtotal - (Number(doc.ds) || 0))
  await sqlClient`update documents set total=${String(newTotal)}, reviewed=false, updated_at=now() where id=${docId}`
  return { ok: true as const, total: newTotal }
}

// Возврат: return_in = от покупателя (+склад, −долг заказчика);
// return_out = поставщику (−склад, −наш долг). Проводка = документ + строки + движение.
export async function createReturn(input: CreateSaleInput & { sourceOrderId?: string; sourceDocId?: string }, kind: 'return_in' | 'return_out') {
  const count = await docRepo.countByType(input.orgId, kind)
  const docId = randomUUID()
  const date = input.date || today()
  const sign = kind === 'return_in' ? 1 : -1   // товар возвращается на склад (+) или уходит (−)

  // Откуда возврат: если пришёл id исходной накладной — берём её карточку-основание
  // (или её номер), чтобы номер возврата ССЫЛАЛСЯ на источник и путь не терялся.
  let srcCard = input.sourceOrderId || ''
  if (!srcCard && input.sourceDocId) {
    const [src] = await docRepo.getDoc(input.sourceDocId)
    if (src) srcCard = src.sourceOrderId || src.number
  }
  // Номер возврата = <ВП|ВС>-<порядковый>-<номер карточки/накладной-источника>.
  const prefix = kind === 'return_in' ? 'ВП' : 'ВС'
  const { sqlClient: sqlNum } = await import('../lib/db')
  let number = docNumber(kind, count)
  if (srcCard) {
    // порядковый возврат ПО ЭТОЙ карточке; при совпадении номера (параллельные возвраты) берём следующий
    const cnt = Number((await sqlNum`select count(*)::int c from documents where org_id=${input.orgId} and type=${kind} and source_order_id=${srcCard}` as unknown as Array<any>)[0]?.c) || 0
    for (let i = cnt + 1; i < cnt + 50; i++) {
      number = `${prefix}-${String(i).padStart(2, '0')}-${srcCard}`
      const ex = await sqlNum`select 1 from documents where org_id=${input.orgId} and number=${number} limit 1` as unknown as Array<any>
      if (!ex.length) break
    }
  }

  let total = 0
  const lines = input.lines.map((l: any) => {
    const amount = lineAmount({ name: l.name, qty: l.qty, price: l.price, widthCm: l.widthCm })
    total += amount
    return { id: randomUUID(), documentId: docId, productId: l.productId, role: 'main', sourcePosId: l.sourcePosId || null, qty: String(l.qty), unit: l.unit || 'шт', price: String(l.price), amount: String(amount), widthCm: l.widthCm != null ? String(l.widthCm) : null }
  })
  const moves = input.lines.map(l => ({
    id: randomUUID(), orgId: input.orgId, warehouseId: input.warehouseId,
    productId: l.productId, qty: String(sign * l.qty), documentId: docId, date,
  }))
  const doc = {
    id: docId, orgId: input.orgId, type: kind, number,
    sourceOrderId: srcCard || null,   // связь возврата с исходной карточкой/накладной (для «Связок»)
    contragentId: input.contragentId, warehouseId: input.warehouseId,
    date, status: 'posted', total: String(total), comment: input.comment || '', projectId: (input as any).projectId || null,
  }
  await docRepo.insertDocumentPosting(doc, lines, moves)
  // Уведомить кабинет контрагента (поставщик/клиент), если он есть, + админов.
  try {
    const dir = kind === 'return_out' ? 'поставщику' : 'от клиента'
    const text = `↩ Возврат ${doc.number} (${dir}) на ${fmtSum(total)} ₸`
    const { db } = await import('../lib/db')
    const { users } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const cab = input.contragentId ? await db.select({ id: users.id }).from(users).where(eq(users.contragentId, input.contragentId)) : []
    const { notify } = await import('./notification.service')
    if (cab.length) await notify(cab.map((u: any) => u.id), text)
    const { notifyAdmins } = await import('./notifyHelpers')
    await notifyAdmins(input.orgId, text)
  } catch { /* уведомления не критичны */ }
  return { id: docId, number: doc.number, total }
}
const fmtSum = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

export const listReturns = async (orgId: string) => withCardTree(await docRepo.listInvoices(orgId, ['return_in', 'return_out']))

// Кабинет контрагента: его накладные, разбитые по разделам Покупки / Продажа / Возврат.
// Покупки  = он купил у нас (расходные, type=sale).
// Продажа  = он поставил нам (приходные, type=purchase).
// Возврат  = возвраты с ним (return_in — от него нам / return_out — мы ему).
export async function listDocsForContragent(orgId: string, contragentId: string) {
  const all = await docRepo.listInvoicesForContragent(orgId, contragentId, ['sale', 'purchase', 'return_in', 'return_out'])
  return {
    purchases: all.filter(d => d.type === 'sale'),            // его покупки у нас
    sales: all.filter(d => d.type === 'purchase'),            // его продажи нам
    returns: all.filter(d => d.type === 'return_in' || d.type === 'return_out'),
  }
}

// Контрагент принимает документ/возврат в своём кабинете. Проверяем принадлежность.
export async function acceptDocByContragent(docId: string, contragentId: string, actorName: string) {
  const [doc] = await docRepo.getDoc(docId)
  if (!doc) return { ok: false, error: 'Документ не найден' }
  if (doc.contragentId !== contragentId) return { ok: false, error: 'Это не ваш документ' }
  if (doc.contragentAccepted) return { ok: true, already: true }
  await docRepo.updateDoc(docId, { contragentAccepted: true } as any)
  try {
    const kindLabel = doc.type === 'return_in' || doc.type === 'return_out' ? 'возврат' : 'накладную'
    const { notifyAdmins } = await import('./notifyHelpers')
    await notifyAdmins(doc.orgId, `✓ ${actorName} принял ${kindLabel} ${doc.number}`)
  } catch { /* уведомление не критично */ }
  return { ok: true, number: doc.number }
}

// Производство: сырьё (input) списывается со склада, готовый товар (output)
// приходуется. Готовый товар — размерное ценообразование: (см×см)/10000=м² × ставка × кол-во.
// ЖЁСТКИЙ ЗАПРЕТ: изделие без цвета на склад не выпускается. Голое «Изделие» — это схема
// (umbrella), а не складская единица. Строку с umbrella переводим на товар
// «Изделие {РАЛ} {см} см» (lib/itemName); нет цвета или см — отказ с понятным текстом.
async function resolveIzdelieOutputs(outputs: CreateProductionInput['outputs']) {
  const { isIzdelie } = await import('../lib/lineAmount')
  const { itemName } = await import('../lib/itemName')
  const { extractRal } = await import('../lib/ral')
  const { ensureProduct } = await import('./producer.service')
  const { db } = await import('../lib/db')
  const { products } = await import('../db/schema')
  const { inArray } = await import('drizzle-orm')

  const ids = Array.from(new Set(outputs.map(o => o.productId)))
  const rows = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : []
  const nameById = new Map(rows.map(p => [p.id, p.name]))

  const out = []
  for (const o of outputs) {
    const base = nameById.get(o.productId) || ''
    // товар уже конкретный (цвет в имени) или это не изделие — ничего не меняем
    if (!isIzdelie(base) || extractRal(base)) { out.push(o); continue }
    const ral = (o as any).ral || extractRal((o as any).comment || '')
    const cm = Number(o.widthCm) || 0
    if (!ral || !(cm > 0)) throw new Error('Изделие без цвета нельзя выпустить на склад: укажите цвет (РАЛ) и размер в см')
    const name = itemName({ name: 'Изделие', color: ral, cm })
    out.push({ ...o, productId: await ensureProduct(name), comment: name })
  }
  return out
}

export async function createProduction(input: CreateProductionInput) {
  input = { ...input, outputs: await resolveIzdelieOutputs(input.outputs) }
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
      comment: l.comment != null ? String(l.comment) : null,   // полное имя изделия (с цветом) для списков
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

// Перемещение товара между складами (головной → филиал-производитель и т.п.).
// Один документ-перемещение (в книге склада-источника) + движения: −со склада-источника,
// +на склад-получатель. Склады могут быть в разных орг (меж-орг перенос листов).
export async function createTransfer(input: import('../dto/transfer.dto').CreateTransferInput) {
  const [fromWh] = await docRepo.warehouseById(input.fromWarehouseId)
  const [toWh] = await docRepo.warehouseById(input.toWarehouseId)
  if (!fromWh || !toWh) return { ok: false as const, error: 'Склад не найден' }
  if (fromWh.id === toWh.id) return { ok: false as const, error: 'Склад-источник и получатель совпадают' }
  const fromOrg = (fromWh as any).orgId, toOrg = (toWh as any).orgId
  const docId = randomUUID()
  const date = input.date || today()
  const count = await docRepo.countByType(fromOrg, 'transfer')
  let total = 0
  const lines: any[] = [], moves: any[] = []
  for (const l of input.lines) {
    const amount = l.qty * (l.price || 0); total += amount
    lines.push({ id: randomUUID(), documentId: docId, productId: l.productId, role: 'main', qty: String(l.qty), unit: l.unit || 'шт', price: String(l.price || 0), amount: String(amount) })
    moves.push({ id: randomUUID(), orgId: fromOrg, warehouseId: input.fromWarehouseId, productId: l.productId, qty: String(-l.qty), documentId: docId, date })   // − источник
    moves.push({ id: randomUUID(), orgId: toOrg, warehouseId: input.toWarehouseId, productId: l.productId, qty: String(l.qty), documentId: docId, date })          // + получатель
  }
  const doc = {
    id: docId, orgId: fromOrg, type: 'transfer', number: docNumber('transfer', count),
    warehouseId: input.fromWarehouseId, date, status: 'posted', total: String(total),
    comment: input.comment || `Перемещение на «${(toWh as any).name}»`,
  }
  await docRepo.insertDocumentPosting(doc, lines, moves)
  return { ok: true as const, id: docId, number: doc.number, total }
}
export const listTransfers = (orgId: string) => docRepo.listByType(orgId, 'transfer')

// Сторно (отмена/удаление) документа — откатывает склад и связи, статус cancelled.
export async function cancelDocument(docId: string) {
  await docRepo.cancelDocument(docId)
  return { ok: true }
}

// Удалить ошибочный документ НАСОВСЕМ (правило владельца 13.11.2026): склад, FIFO-связи,
// оплаты по документу и зеркала филиалов уходят вместе с ним, карточка-заявка отвязывается
// и снова ждёт проведения. В отличие от сторно, в списке не остаётся «отменён».
export async function purgeDocument(docId: string, actor?: any) {
  const [d] = await docRepo.getDoc(docId)
  if (!d) return { ok: false as const, error: 'Документ не найден' }
  const numbers = await docRepo.purgeDocument(docId)
  return { ok: true as const, numbers, count: numbers.length }
}
