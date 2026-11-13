// Смена мастера за день: доходы (продажи нал/каспи/QR/долг), проверка (оплаты+долг=продано),
// производство в запас, расходы (ЗП + текущие через «Деньги»), остатки по счетам (с учётом
// продаж и переводов), остаток KASPI GOLD (личный сбор мастера), перевод GOLD→банк, закрытие.
import { sqlClient } from '../lib/db'
import { financeDay, saveFinRow, postFinDay } from './finmoney.service'
import * as attendance from '../repositories/attendance.repo'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0
const findAcc = (accts: any[], nm: string) => accts.find((a: any) => (a.name || '').trim().toLowerCase() === nm.toLowerCase())

export async function masterShift(orgId: string, date: string) {
  // Вид орг: у листогиба (producer_seller) процентов от маржи нет — экран прячет пул 40%.
  const orgKind = ((await sqlClient`select kind from organizations where id=${orgId} limit 1` as unknown as Array<any>)[0]?.kind) || ''
  // Доходы: проданные карточки за день (по дате расходной накладной).
  const incRow = (await sqlClient`
    select coalesce(sum(o.paid_cash),0)::float cash, coalesce(sum(o.paid_kaspi),0)::float kaspi,
      coalesce(sum(o.paid_qr),0)::float qr, coalesce(sum(t.total - coalesce(o.discount_sum,0)),0)::float total
    from orders o
    join documents d on d.id = o.linked_doc_id and d.date=${date} and d.status<>'cancelled' and d.type='sale'
    join (select card_id, sum(case when lower(coalesce(name1c,oral)) like 'изделие%' and coalesce(width_cm,0)>0 then qty*width_cm*price else qty*price end) total from order_positions group by card_id) t on t.card_id = o.id
    where o.org_id=${orgId} and o.is_cancelled=false
  ` as unknown as Array<any>)[0] || { cash: 0, kaspi: 0, qr: 0, total: 0 }
  // Чеки дня: карточка + кто пробил (seller), покупатель, номер накладной, состав (для журнала кассы).
  const cards = await sqlClient`
    select o.id, o.payment, o.seller, o.paid_cash::float "paidCash", o.paid_kaspi::float "paidKaspi", o.paid_qr::float "paidQr",
      o.change_sum::float "changeSum", (t.total - coalesce(o.discount_sum,0))::float total, o.discount_sum::float "discountSum", t.cnt::int cnt, c.name customer, d.number "docNumber", o.updated_at ts
    from orders o
    join documents d on d.id = o.linked_doc_id and d.date=${date} and d.status<>'cancelled' and d.type='sale'
    join (select card_id, sum(case when lower(coalesce(name1c,oral)) like 'изделие%' and coalesce(width_cm,0)>0 then qty*width_cm*price else qty*price end) total, count(*) cnt from order_positions group by card_id) t on t.card_id = o.id
    left join contragents c on c.id = o.contact_id
    where o.org_id=${orgId} and o.is_cancelled=false
    order by o.updated_at desc
  ` as unknown as Array<any>
  // Состав чеков одним запросом — журнал раскрывается без похода за каждой карточкой.
  const ids = cards.map((c: any) => c.id)
  const lines = ids.length ? await sqlClient`
    select card_id "cardId", coalesce(name1c, oral) name, qty::float qty, price::float price, width_cm::float "widthCm", unit
    from order_positions where card_id = any(${ids}) order by id
  ` as unknown as Array<any> : []
  for (const c of cards) (c as any).lines = lines.filter((l: any) => l.cardId === c.id)
  // Себестоимость чека: по строке (cost_price — доля листа у изделий), иначе закуп товара.
  // nocost — сколько строк без закупочной цены: по ним себестоимость не посчитана (прибыль
  // будет завышена), экран помечает такой чек.
  const costRows = ids.length ? await sqlClient`
    select p.card_id "cardId",
      coalesce(sum(p.qty * coalesce(nullif(p.cost_price,0), pr.price_in, 0)),0)::float cost,
      count(*) filter (where coalesce(nullif(p.cost_price,0), pr.price_in, 0) = 0)::int nocost
    from order_positions p left join products pr on pr.id = p.product_id
    where p.card_id = any(${ids}) group by p.card_id
  ` as unknown as Array<any> : []
  const costByCard: Record<string, any> = {}
  for (const r of costRows) costByCard[r.cardId] = r
  for (const c of cards) {
    const r = costByCard[(c as any).id]
    ;(c as any).cost = num(r?.cost)
    ;(c as any).nocost = Number(r?.nocost) || 0
    ;(c as any).profit = num((c as any).total) - num(r?.cost)
  }

  const cash = num(incRow.cash), kaspi = num(incRow.kaspi), qr = num(incRow.qr), total = num(incRow.total)
  const paid = cash + kaspi + qr
  const debt = Math.max(0, total - paid)
  // ── ФАКТ ПО СЧЕТАМ (синхронизация с «Деньгами»/финансами) ─────────────────────
  // Ячейки «Касса дня» должны совпадать с движением денег по счетам: кроме оплат по
  // чекам ДНЯ туда приходят погашения долгов за прошлые дни и прочий доход. По чекам
  // считаем отдельно — чтобы сверка «продано = оплачено + долг» осталась целой.
  const inRows = await sqlClient`
    select coalesce(a.name,'') acc, p.amount::float amount, p.document_id::text did,
      (d.date = ${date}) same_day, coalesce(p.comment,'') cm
    from payments p
    left join cash_accounts a on a.id = p.cash_account_id
    left join documents d on d.id = p.document_id
    where p.org_id=${orgId} and p.date=${date} and p.direction='in'
  ` as unknown as Array<any>
  const outRows = await sqlClient`
    select coalesce(a.name,'') acc, p.amount::float amount, coalesce(p.comment,'') cm
    from payments p left join cash_accounts a on a.id = p.cash_account_id
    where p.org_id=${orgId} and p.date=${date} and p.direction='out'
  ` as unknown as Array<any>
  const slot = (nm: string) => /kaspi|касп/i.test(nm) ? 'kaspi' : /банк/i.test(nm) ? 'qr' : 'cash'
  const factIn = { cash: 0, kaspi: 0, qr: 0 }          // всего пришло на счета
  const byCheck = { cash: 0, kaspi: 0, qr: 0 }         // из них — оплаты чеков этого дня
  let debtPay = 0, otherIn = 0                          // погашения долгов прошлых дней и прочий доход
  for (const r of inRows) {
    const k = slot(r.acc) as 'cash' | 'kaspi' | 'qr'
    const v = num(r.amount)
    factIn[k] += v
    if (r.did && r.same_day) byCheck[k] += v
    else if (r.did) debtPay += v
    else otherIn += v
  }
  const factOut = { cash: 0, kaspi: 0, qr: 0 }          // ушло со счетов (возвраты, инкассация, расходы)
  for (const r of outRows) factOut[slot(r.acc) as 'cash' | 'kaspi' | 'qr'] += num(r.amount)
  const fact = { ...factIn, total: factIn.cash + factIn.kaspi + factIn.qr, byCheck, debtPay, otherIn, out: factOut }
  const income = { cash, kaspi, qr, debt, total }
  ;(income as any).fact = fact   // факт по счетам — рядом с продажами дня
  // Проверка (как в Excel): оплаты + долг = продано (отпуск). Diff должен быть 0.
  const diff = Math.round((paid + debt) - total)
  const check = { paid, debt, sold: total, diff, ok: Math.abs(diff) < 1 }

  // Производство В ЗАПАС за день — ТОЛЬКО «Создать запасы на склад» (produceToStock, comment
  // «Производство на запас…»). Выпуск изделий ПРИ ПРОДАЖЕ (produceToBase, comment «…заявка ЗК-…»)
  // сюда НЕ входит — те изделия сразу проданы, а не легли в запас.
  const stkRow = (await sqlClient`
    select coalesce(sum(dl.amount),0)::float amount, coalesce(sum(dl.qty),0)::float qty
    from documents d join document_lines dl on dl.document_id = d.id
    where d.org_id=${orgId} and d.type='production' and d.status<>'cancelled' and d.date=${date}
      and dl.role='output' and d.comment ilike '%на запас%'
  ` as unknown as Array<any>)[0] || { amount: 0, qty: 0 }
  // Список «что сделано на запас» за день (товар · см · кол-во) — для просмотра, без сумм.
  const stockItems = await sqlClient`
    select coalesce(nullif(dl.comment,''), p.name, 'Изделие') name, dl.width_cm::float "widthCm", coalesce(sum(dl.qty),0)::float qty
    from documents d join document_lines dl on dl.document_id = d.id
    left join products p on p.id = dl.product_id
    where d.org_id=${orgId} and d.type='production' and d.status<>'cancelled' and d.date=${date}
      and dl.role='output' and d.comment ilike '%на запас%'
    group by coalesce(nullif(dl.comment,''), p.name, 'Изделие'), dl.width_cm order by qty desc
  ` as unknown as Array<any>

  // «Деньги» за день (расходы + переводы). Авто-строки (инкассации/оплаты, r.auto) ИСКЛЮЧАЕМ —
  // они выведены из payments и уже учтены в payMap; иначе задвоение остатков/расходов.
  const fd = await financeDay(orgId, date)
  const finRows = (fd.rows || []).filter((r: any) => !r.auto)
  const expRows = finRows.map((r: any) => ({ ...r, amt: (r.amounts || []).reduce((s: number, a: any) => s + num(a.amount), 0) })).filter((r: any) => r.amt < 0 && r.type !== 'mv')
  const salaryTotal = expRows.filter((r: any) => (r.article || '') === 'ЗП').reduce((s: number, r: any) => s - r.amt, 0)
  const currentTotal = expRows.filter((r: any) => (r.article || '') !== 'ЗП').reduce((s: number, r: any) => s - r.amt, 0)
  const hasDraft = finRows.some((r: any) => r.status !== 'posted' && (r.amounts || []).some((a: any) => num(a.amount) !== 0))

  // Остаток по счетам за день: продажи (payments) + движения «Денег» (расходы/переводы).
  const payDay = await sqlClient`
    select cash_account_id::text acc, coalesce(sum(case when direction='in' then amount else -amount end),0)::float net
    from payments where org_id=${orgId} and date=${date} and cash_account_id is not null group by cash_account_id
  ` as unknown as Array<any>
  const payMap: Record<string, number> = {}; for (const p of payDay) payMap[p.acc] = num(p.net)
  const finMap: Record<string, number> = {}; for (const r of finRows) for (const am of (r.amounts || [])) finMap[am.accountId] = (finMap[am.accountId] || 0) + num(am.amount)
  const accounts = (fd.accounts || []).map((a: any) => ({ id: a.id, name: a.name, fromSales: payMap[a.id] || 0, fromFin: finMap[a.id] || 0, net: (payMap[a.id] || 0) + (finMap[a.id] || 0) }))

  // Накопительные остатки по счетам (оплаты продаж + движения «Денег»). 3 уровня инкассации:
  // у мастера = Наличка + KASPI GOLD; у филиала = Банковский счёт; у головного = отдано (payments out мосту).
  // Остаток счёта = НАЧАЛЬНЫЙ ОСТАТОК + движения С ДАТЫ ОТСЕЧЕНИЯ (всё, что раньше, уже в нём).
  const balOf = async (accId?: string) => {
    if (!accId) return 0
    const o = (await sqlClient`select opening_balance::float v, opening_as_of::text d from cash_accounts where id=${accId}` as unknown as Array<any>)[0]
    const since = o?.d || '0001-01-01'
    const p = (await sqlClient`select coalesce(sum(case when direction='in' then amount else -amount end),0)::float v from payments where org_id=${orgId} and cash_account_id=${accId} and date >= ${since}` as unknown as Array<any>)[0]
    const f = (await sqlClient`select coalesce(sum(a.amount),0)::float v from fin_row_amounts a join fin_rows r on r.id=a.row_id where r.org_id=${orgId} and r.status='posted' and a.account_id=${accId} and r.date >= ${since}` as unknown as Array<any>)[0]
    return num(o?.v || 0) + num(p.v) + num(f.v)
  }
  const gold = findAcc(fd.accounts || [], 'KASPI GOLD'), cashA = findAcc(fd.accounts || [], 'Основная касса'), bankA = findAcc(fd.accounts || [], 'Банковский счет')
  const goldBalance = await balOf(gold?.id), cashBalance = await balOf(cashA?.id), bankBalance = await balOf(bankA?.id)
  // Долг перед головным (мы закупаем у него в долг) + сколько уже отдано (инкассировано головному).
  const bridge = (await sqlClient`select c.id::text id from contragents c join organizations o on o.id=c.org_ref_id and o.kind='hq' where c.org_id=${orgId} limit 1` as unknown as Array<any>)[0]
  let debtHQ = 0, remittedHQ = 0
  if (bridge) {
    const pur = (await sqlClient`select coalesce(sum(total),0)::float v from documents where org_id=${orgId} and contragent_id=${bridge.id} and type='purchase' and status<>'cancelled'` as unknown as Array<any>)[0]
    const rem = (await sqlClient`select coalesce(sum(amount),0)::float v from payments where org_id=${orgId} and contragent_id=${bridge.id} and direction='out'` as unknown as Array<any>)[0]
    remittedHQ = num(rem.v)
    debtHQ = num(pur.v) - remittedHQ
  }

  // Сотрудники филиала (справочник) — для табеля, с дневным окладом.
  const staff = await sqlClient`select id::text, name, position, daily_wage::float "dailyWage" from employees where org_id=${orgId} and archived=false order by name` as unknown as Array<any>
  // Табель дня: кто отмечен на смене (начисление ЗП). Отметка есть → колонка ЗП = Σ окладов отмеченных.
  const marksRows = await attendance.listMarks(orgId, date)
  const attIds = marksRows.map((r: any) => r.employeeId)
  // ЗП, вписанная руками за этот день (пусто → оклад сотрудника) — показываем в табеле.
  const attWage: Record<string, number> = {}
  for (const r of marksRows as any[]) if (r.amount != null) attWage[r.employeeId] = num(r.amount)
  // Кому ЗП за этот день УЖЕ выдана (строки fin_rows article='ЗП') — чтобы не выдать дважды.
  const zpPaidRows = await sqlClient`select distinct lower(trim(who)) who from fin_rows
    where org_id=${orgId} and date=${date} and article='ЗП' and coalesce(trim(who),'') <> ''` as unknown as Array<any>
  const zpPaidWho = zpPaidRows.map((r: any) => r.who)
  // Статьи расходов (как в 1С: 7100/7200/7400) — для «текущего расхода».
  const expenseArticles = await sqlClient`select id::text, name, activity, direction from fin_expense_articles where org_id=${orgId} and archived=false and is_group=false order by activity, sort_order, name` as unknown as Array<any>

  // ── ОТЧЁТ ДНЯ (как Excel «Отчет дня») ──────────────────────────────────────────
  // Наценка дня = продано − себестоимость (price_in проданных позиций).
  const costRow = (await sqlClient`
    select coalesce(sum(op.qty * coalesce(nullif(op.cost_price::float,0), p.price_in::float, 0)),0)::float cost
    from orders o join documents d on d.id=o.linked_doc_id and d.date=${date} and d.status<>'cancelled' and d.type='sale'
    join order_positions op on op.card_id=o.id
    left join products p on p.id=op.product_id
    where o.org_id=${orgId} and o.is_cancelled=false
  ` as unknown as Array<any>)[0] || { cost: 0 }
  const margin = Math.max(0, total - num(costRow.cost))
  // Продавцы на смене = кто пробил чек в этот день (между ними делится 40% наценки).
  const sellersDay = await sqlClient`
    select coalesce(nullif(trim(o.seller),''),'—') name
    from orders o join documents d on d.id=o.linked_doc_id and d.date=${date} and d.status<>'cancelled' and d.type='sale'
    where o.org_id=${orgId} and o.is_cancelled=false and coalesce(trim(o.seller),'')<>''
    group by 1 order by 1
  ` as unknown as Array<any>
  // ТАБЕЛЬ: отмеченные на смене = начисление оклада. 40% делится АДМИНОМ вручную при выплате
  // (не авто). Если за день табель пуст — fallback на старое поведение (продавцы с чеков +
  // фактически выплаченная ЗП), чтобы история не обнулилась.
  const attSet = new Set(attIds)
  const markedStaff = staff.filter((s: any) => attSet.has(s.id))
  const hasMarks = markedStaff.length > 0
  const wageByName: Record<string, number> = {}; for (const s of staff) wageByName[(s.name || '').trim().toLowerCase()] = num(s.dailyWage)
  // Оклад дня = вписанный руками в табеле, иначе ставка сотрудника.
  const wageOf = (u: any) => num(attWage[u.id] != null ? attWage[u.id] : u.dailyWage)
  const reportSellers = hasMarks
    ? markedStaff.map((u: any) => { const oklad = wageOf(u); return { name: u.name, oklad, bonus: 0, zp: oklad } })
    : sellersDay.map((s: any) => { const oklad = wageByName[(s.name || '').trim().toLowerCase()] || 0; return { name: s.name, oklad, bonus: 0, zp: oklad } })
  // Колонка ЗП = Σ окладов отмеченных (начисление по табелю); без отметок — Σ fin_rows ЗП (факт).
  const tabelZp = markedStaff.reduce((a: number, u: any) => a + wageOf(u), 0)
  const zpFormula = reportSellers.reduce((a: number, r: any) => a + r.zp, 0)
  const zpTotal = hasMarks ? tabelZp : (salaryTotal > 0 ? salaryTotal : zpFormula)
  const shopExp = currentTotal                          // расходы магазина/административные
  // ВОЗВРАТЫ ДНЯ (магазин принимает товар обратно по себестоимости): сумма возвратных
  // накладных и сколько из них реально ушло ДЕНЬГАМИ со счёта (остальное погасило долг).
  // Деньги со счёта — минус кассе, поэтому вычитаем из итога дня.
  const retRow = (await sqlClient`
    select coalesce(sum(total),0)::float v from documents
    where org_id=${orgId} and type='return_in' and status<>'cancelled' and date=${date}
      and coalesce(comment,'') not like 'Обмен по чеку%'
  ` as unknown as Array<any>)[0] || { v: 0 }
  const refundRow = (await sqlClient`
    select coalesce(sum(amount),0)::float v from payments
    where org_id=${orgId} and direction='out' and date=${date} and comment like 'Возврат %'
  ` as unknown as Array<any>)[0] || { v: 0 }
  const retTotal = num(retRow.v), refundTotal = num(refundRow.v)
  const dayResult = total - retTotal - zpTotal - shopExp   // итого дня = продажа − возврат − ЗП − расходы
  const report = { sold: total, margin, marginPct: total > 0 ? margin / total : 0, cash, kaspi, qr, debt, ret: retTotal, refund: refundTotal, sellers: reportSellers, zpTotal, zpPaid: salaryTotal, zpFormula, shopExp, result: dayResult }

  // ── ДОЛГИ (дебиторка): непогашенные чеки орг = итог − скидка − всего оплачено > 0 (не по дню) ──
  const debts = await sqlClient`
    select o.id, coalesce(c.name, o.from_name, 'Розница') customer, d.number "docNumber", o.updated_at ts, o.seller,
      (t.total - coalesce(o.discount_sum,0) - coalesce(pin.paid,0))::float debt
    from orders o
    join documents d on d.id=o.linked_doc_id and d.status<>'cancelled' and d.type='sale'
    join (select card_id, sum(case when lower(coalesce(name1c,oral)) like 'изделие%' and coalesce(width_cm,0)>0 then qty*width_cm*price else qty*price end) total from order_positions group by card_id) t on t.card_id=o.id
    left join (select document_id did, coalesce(sum(amount),0) paid from payments where direction='in' group by document_id) pin on pin.did=o.linked_doc_id
    left join contragents c on c.id=o.contact_id
    where o.org_id=${orgId} and o.is_cancelled=false
      and (t.total - coalesce(o.discount_sum,0) - coalesce(pin.paid,0)) > 0.5
      -- Только «долг Нипе» (свои клиенты). «Долг к головному» (расходная на мост-контрагент ГО)
      -- сюда НЕ попадает — он гасится взаиморасчётом с головным в конце месяца, а не по чекам.
      and not exists (select 1 from contragents bc join organizations bo on bo.id=bc.org_ref_id and bo.kind='hq' where bc.id = d.contragent_id)
    order by o.updated_at desc
  ` as unknown as Array<any>
  const debtTotal = debts.reduce((a: number, x: any) => a + num(x.debt), 0)

  // Прочие доходы дня (деньги без товара, 50/50) — отдельной строкой в журнале чеков.
  const { listOtherIncome } = await import('./cashier.service')
  const otherIncome = await listOtherIncome(orgId, date)

  return {
    date, kind: orgKind, income, check, cards, staff, otherIncome, attendance: attIds, attWage, zpPaidWho, expenseArticles, report, debts, debtTotal,
    stock: { amount: num(stkRow.amount), qty: num(stkRow.qty), items: stockItems.map((s: any) => ({ name: s.name, widthCm: num(s.widthCm), qty: num(s.qty) })) },
    expenses: { rows: expRows, salaryTotal, currentTotal, total: salaryTotal + currentTotal },
    accounts, goldId: gold?.id || null, goldBalance, cashBalance, bankBalance,
    levels: { master: cashBalance + goldBalance, masterCash: cashBalance, masterGold: goldBalance, branch: bankBalance, hq: remittedHQ, debtHQ },
    hasDraft,
  }
}

// Месячный отчёт кассы (как Excel «месяц»): по каждому дню продажи/долг/проверка/ЗП/расходы + итоги.
export async function cashReport(orgId: string, from: string, to: string) {
  // Вид орг — от него зависит РАСКЛАДКА месяца (Нипа-листогиб = формат Excel «месяц»).
  const orgKind = ((await sqlClient`select kind from organizations where id=${orgId} limit 1` as unknown as Array<any>)[0]?.kind) || ''
  const sales = await sqlClient`
    select d.date::text as "day", coalesce(sum(o.paid_cash),0)::float cash, coalesce(sum(o.paid_kaspi),0)::float kaspi,
      coalesce(sum(o.paid_qr),0)::float qr, coalesce(sum(t.total - coalesce(o.discount_sum,0)),0)::float sold, count(*)::int cnt
    from orders o
    join documents d on d.id=o.linked_doc_id and d.status<>'cancelled' and d.type='sale' and d.date between ${from} and ${to}
    join (select card_id, sum(case when lower(coalesce(name1c,oral)) like 'изделие%' and coalesce(width_cm,0)>0 then qty*width_cm*price else qty*price end) total from order_positions group by card_id) t on t.card_id=o.id
    where o.org_id=${orgId} and o.is_cancelled=false
    group by d.date
  ` as unknown as Array<any>
  // ПРИХОД по ДАТЕ ОПЛАТЫ (payments, direction=in по продажам) — включает ПОГАШЕНИЯ ДОЛГА прошлых
  // дней. Долг дня = продано − приход → при оплате старого долга уходит в минус (нетто по месяцу).
  const incomeRows = await sqlClient`
    select p.date::text as "day",
      coalesce(sum(case when ca.name ilike '%kaspi%' or ca.name ilike '%каспи%' then p.amount else 0 end),0)::float kaspi,
      coalesce(sum(case when ca.kind='bank' or ca.name ilike '%банк%' then p.amount else 0 end),0)::float qr,
      coalesce(sum(case when not (ca.name ilike '%kaspi%' or ca.name ilike '%каспи%' or ca.kind='bank' or ca.name ilike '%банк%') then p.amount else 0 end),0)::float cash
    from payments p
    join documents d on d.id=p.document_id and d.type='sale' and d.status<>'cancelled'
    join cash_accounts ca on ca.id=p.cash_account_id
    where p.org_id=${orgId} and p.direction='in' and p.date between ${from} and ${to}
    group by p.date
  ` as unknown as Array<any>
  const exps = await sqlClient`
    with rr as (
      select r.date, r.article, (select coalesce(sum(a.amount),0) from fin_row_amounts a where a.row_id=r.id) tot
      from fin_rows r where r.org_id=${orgId} and r.type<>'mv' and r.date between ${from} and ${to}
    )
    select date::text as "day",
      coalesce(sum(case when article='ЗП' and tot<0 then -tot else 0 end),0)::float salary,
      coalesce(sum(case when article<>'ЗП' and tot<0 then -tot else 0 end),0)::float as "current"
    from rr group by date
  ` as unknown as Array<any>
  // Возврат по дням: сумма возвратных накладных (return_in) филиала.
  const rets = await sqlClient`
    select date::text as "day", coalesce(sum(total),0)::float ret from documents
    where org_id=${orgId} and type='return_in' and status<>'cancelled' and date between ${from} and ${to}
    group by date
  ` as unknown as Array<any>
  // Себестоимость по дням = Σ(кол-во × приходная цена price_in). Маржа = КАССА − себестоимость.
  const costs = await sqlClient`
    select d.date::text as "day", coalesce(sum(op.qty * coalesce(nullif(op.cost_price::float,0), p.price_in::float, 0)),0)::float cost
    from orders o
    join documents d on d.id=o.linked_doc_id and d.status<>'cancelled' and d.type='sale' and d.date between ${from} and ${to}
    join order_positions op on op.card_id=o.id
    left join products p on p.id=op.product_id
    where o.org_id=${orgId} and o.is_cancelled=false
    group by d.date
  ` as unknown as Array<any>
  const costByDay: Record<string, number> = {}; for (const c of costs) costByDay[c.day] = num(c.cost)
  const retByDay: Record<string, number> = {}; for (const r of rets) retByDay[r.day] = num(r.ret)
  // ТАБЕЛЬ по дням: если за день есть отметки — колонка ЗП = Σ окладов отмеченных (начисление);
  // дня без отметок НЕТ в tabelByDay → fallback на fin_rows ЗП (salary), история не обнуляется.
  const tabel = await attendance.tabelSumByDay(orgId, from, to)
  const tabelByDay: Record<string, number> = {}; for (const t of tabel) tabelByDay[t.day] = num(t.zp)

  const byDay: Record<string, any> = {}
  const ensure = (day: string) => (byDay[day] = byDay[day] || { day, cash: 0, kaspi: 0, qr: 0, sold: 0, cnt: 0, salary: 0, current: 0 })
  // sold/cnt — по дате продажи (документ). cash/kaspi/qr — по дате ОПЛАТЫ (incomeRows, вкл. погашения).
  for (const s of sales) { const r = ensure(s.day); r.sold = num(s.sold); r.cnt = num(s.cnt) }
  for (const i of incomeRows) { const r = ensure(i.day); r.cash = num(i.cash); r.kaspi = num(i.kaspi); r.qr = num(i.qr) }
  for (const e of exps) { const r = ensure(e.day); r.salary = num(e.salary); r.current = num(e.current) }
  // Строку дня создаём и для дней, где был ТОЛЬКО возврат (иначе возврат не показывается).
  for (const r of rets) ensure(r.day)
  // ...и для дней, где отмечен только табель (ЗП начислена, но продаж/расходов нет).
  for (const t of tabel) ensure(t.day)

  // ── Остатки по счетам нарастающим ─────────────────────────────────────────────
  // Движения счёта = продажи/возвраты (payments) + «Деньги» (fin_row_amounts, вкл. переводы).
  const accounts = await sqlClient`select id::text id, name from cash_accounts where org_id=${orgId} and archived=false order by sort_order, name` as unknown as Array<any>
  const payMoves = await sqlClient`
    select cash_account_id::text acc, date::text as "day", coalesce(sum(case when direction='in' then amount else -amount end),0)::float net
    from payments where org_id=${orgId} and cash_account_id is not null and date between ${from} and ${to} group by cash_account_id, date
  ` as unknown as Array<any>
  const finMoves = await sqlClient`
    select a.account_id::text acc, r.date::text as "day", coalesce(sum(a.amount),0)::float net
    from fin_rows r join fin_row_amounts a on a.row_id=r.id
    where r.org_id=${orgId} and r.status='posted' and r.date between ${from} and ${to} group by a.account_id, r.date
  ` as unknown as Array<any>
  // Стартовый остаток на начало периода = все движения по счёту ДО from (авто из истории).
  // ТОЛЬКО проведённые строки листа: черновик — это ещё не деньги (из-за этого в старт
  // остатков попадал неподтверждённый черновик и счёт показывал ложный минус).
  // Начальный остаток счёта (перенос из 1С) идёт в старт, движения ДО даты отсечения — нет.
  const openBal = await sqlClient`select id::text acc, opening_balance::float net from cash_accounts
    where org_id=${orgId} and archived=false and (opening_as_of is null or opening_as_of <= ${to})` as unknown as Array<any>
  const payOpen = await sqlClient`
    select p.cash_account_id::text acc, coalesce(sum(case when p.direction='in' then p.amount else -p.amount end),0)::float net
    from payments p join cash_accounts ca on ca.id=p.cash_account_id
    where p.org_id=${orgId} and p.cash_account_id is not null and p.date < ${from}
      and p.date >= coalesce(ca.opening_as_of, '0001-01-01'::date) group by p.cash_account_id
  ` as unknown as Array<any>
  const finOpen = await sqlClient`
    select a.account_id::text acc, coalesce(sum(a.amount),0)::float net
    from fin_rows r join fin_row_amounts a on a.row_id=r.id join cash_accounts ca on ca.id=a.account_id
    where r.org_id=${orgId} and r.status='posted' and r.date < ${from}
      and r.date >= coalesce(ca.opening_as_of, '0001-01-01'::date) group by a.account_id
  ` as unknown as Array<any>
  const opening: Record<string, number> = {}; for (const a of accounts) opening[a.id] = 0
  for (const r of [...openBal, ...payOpen, ...finOpen]) opening[r.acc] = (opening[r.acc] || 0) + num(r.net)
  const movByDay: Record<string, Record<string, number>> = {}
  for (const r of [...payMoves, ...finMoves]) { (movByDay[r.day] = movByDay[r.day] || {})[r.acc] = (movByDay[r.day][r.acc] || 0) + num(r.net) }
  const movDays = Object.keys(movByDay).sort()

  const days = Object.values(byDay).map((r: any) => {
    const paid = r.cash + r.kaspi + r.qr                 // КАССА = Нал(осн.касса) + Каспи(GOLD) + QR(банк.счёт), вкл. погашения долга
    const debt = r.sold - paid                           // Долг (может быть МИНУС — погашен долг прошлых дней «вчерашней торговли»)
    const cost = costByDay[r.day] || 0, ret = retByDay[r.day] || 0
    const otpusk = cost + debt - ret                     // отпуск = себестоимость + долг − возврат
    const margin = paid - cost                           // маржа (100%) = КАССА − себестоимость (по образцу отчёта)
    // Проценты от маржи (60/40 и бонус к ЗП) — только там, где они приняты. У листогиба
    // (producer_seller) процентов НЕТ: в отчёте остаются маржа, ЗП (оклад) и расходы.
    const pct = orgKind !== 'producer_seller'
    const split60 = pct ? margin * 0.6 : 0, split40 = pct ? margin * 0.4 : 0
    // Колонка ЗП = табель дня (Σ окладов отмеченных), иначе fin_rows ЗП (r.salary) для старых дней.
    const zpTabel = tabelByDay[r.day]
    const salary = zpTabel !== undefined ? zpTabel : r.salary
    // Колонка ЗП+40 = НАЧИСЛЕНИЕ по формуле отчёта: оклад (ЗП) + 40% маржи дня.
    // Это сумма к выдаче, а не факт выплаты (факт виден в «Расход»/движениях счетов).
    // При минусовой марже бонуса нет (оклад не срезаем).
    const zpPlus40 = pct ? salary + Math.max(0, split40) : 0
    // Остаток каждого счёта на конец дня = стартовый + все движения по датам ≤ этот день.
    const bal: Record<string, number> = { ...opening }
    for (const md of movDays) { if (md <= r.day) { const mm = movByDay[md]; for (const acc in mm) bal[acc] = (bal[acc] || 0) + mm[acc] } }
    const balTotal = accounts.reduce((s: number, a: any) => s + (bal[a.id] || 0), 0)
    return { ...r, salary, paid, ret, cost, otpusk, margin, split60, split40, zpPlus40, bal, balTotal, debt, expense: salary + r.current, ok: Math.abs((paid + debt) - r.sold) < 1 }
  }).sort((a: any, b: any) => a.day.localeCompare(b.day))

  const totals = days.reduce((t: any, d: any) => ({
    cash: t.cash + d.cash, kaspi: t.kaspi + d.kaspi, qr: t.qr + d.qr, paid: t.paid + d.paid, debt: t.debt + d.debt,
    sold: t.sold + d.sold, ret: t.ret + d.ret, cost: t.cost + d.cost, otpusk: t.otpusk + d.otpusk, margin: t.margin + d.margin, split60: t.split60 + d.split60, split40: t.split40 + d.split40, zpPlus40: t.zpPlus40 + d.zpPlus40,
    salary: t.salary + d.salary, current: t.current + d.current, expense: t.expense + d.expense, cnt: t.cnt + d.cnt,
  }), { cash: 0, kaspi: 0, qr: 0, paid: 0, debt: 0, sold: 0, ret: 0, cost: 0, otpusk: 0, margin: 0, split60: 0, split40: 0, zpPlus40: 0, salary: 0, current: 0, expense: 0, cnt: 0 })
  // Итоговый остаток на конец периода по каждому счёту.
  const endBal: Record<string, number> = { ...opening }
  for (const md in movByDay) for (const acc in movByDay[md]) endBal[acc] = (endBal[acc] || 0) + movByDay[md][acc]
  const endBalTotal = accounts.reduce((s: number, a: any) => s + (endBal[a.id] || 0), 0)
  return { from, to, kind: orgKind, days, totals, accounts, opening, endBal, endBalTotal, ok: days.every((d: any) => d.ok) }
}

// ─── Свод счетов (для головного): балансы головного + филиалов + общий итог ─────────
// Головной видит счета ВСЕХ орг; деньги в кассах филиала не инкассированы ему → «в ожидании».
// Баланс счёта = Σ payments (in−out) + Σ fin_row_amounts (posted) за всё время = текущий остаток.
export async function accountsOverview(viewerOrgId: string) {
  const { orgById } = await import('../repositories/refs.repo')
  const viewer = await orgById(viewerOrgId)
  const isHq = (viewer as any)?.kind === 'hq'
  const orgs = isHq
    ? await sqlClient`select id::text id, name, kind from organizations order by case kind when 'hq' then 0 when 'producer_seller' then 1 else 2 end, name`
    : await sqlClient`select id::text id, name, kind from organizations where id=${viewerOrgId}`
  const accs = await sqlClient`select id::text id, org_id::text oid, name, kind, opening_balance::float opening, opening_as_of::text "openingAsOf" from cash_accounts where archived=false order by sort_order, name`
  // Баланс счёта = начальный остаток (перенос из 1С) + движения С ДАТЫ ОТСЕЧЕНИЯ.
  const open = await sqlClient`select id::text acc, opening_balance::float v from cash_accounts where archived=false`
  const pay = await sqlClient`select p.cash_account_id::text acc, coalesce(sum(case when p.direction='in' then p.amount else -p.amount end),0)::float v
    from payments p join cash_accounts ca on ca.id=p.cash_account_id
    where p.cash_account_id is not null and p.date >= coalesce(ca.opening_as_of, '0001-01-01'::date) group by p.cash_account_id`
  const finm = await sqlClient`select a.account_id::text acc, coalesce(sum(a.amount),0)::float v
    from fin_row_amounts a join fin_rows r on r.id=a.row_id join cash_accounts ca on ca.id=a.account_id
    where r.status='posted' and r.date >= coalesce(ca.opening_as_of, '0001-01-01'::date) group by a.account_id`
  const bal = new Map<string, number>()
  for (const r of [...(open as any[]), ...(pay as any[]), ...(finm as any[])]) bal.set(r.acc, (bal.get(r.acc) || 0) + num(r.v))
  // Банк/QR филиала = наша кюар = деньги головного → сразу «свои», НЕ «в ожидании».
  // Нал/каспи филиала — физические, инкассируются позже → «в ожидании».
  const isBankQr = (a: any) => a.kind === 'bank' || /банков|qr|кюар|кюр/i.test(a.name || '')
  const blocks = (orgs as any[]).map(o => {
    const isHqOrg = o.kind === 'hq'
    const items = (accs as any[]).filter(a => a.oid === o.id).map(a => ({
      id: a.id, name: a.name, kind: a.kind, balance: num(bal.get(a.id)),
      opening: num(a.opening), openingAsOf: a.openingAsOf || null,   // начальный остаток (перенос из 1С)
      toHq: !isHqOrg && isBankQr(a),   // деньги головного (у филиала — инфо)
    }))
    const total = items.reduce((s, x) => s + x.balance, 0)
    const pendingSum = items.filter((x: any) => !isHqOrg && !x.toHq).reduce((s: number, x: any) => s + x.balance, 0)
    return { orgId: o.id, orgName: o.name, kind: o.kind, pending: !isHqOrg && pendingSum !== 0, items, total, pendingSum }
  })
  const grandTotal = blocks.reduce((s, b) => s + b.total, 0)
  // «Свои» = счета головного + банк/QR филиалов (наша кюар). «В ожидании» = нал/каспи филиалов.
  const ownTotal = blocks.reduce((s, b) => s + b.items.filter((x: any) => b.kind === 'hq' || x.toHq).reduce((t: number, x: any) => t + x.balance, 0), 0)
  const pendingTotal = blocks.reduce((s, b) => s + b.items.filter((x: any) => b.kind !== 'hq' && !x.toHq).reduce((t: number, x: any) => t + x.balance, 0), 0)
  return { blocks, grandTotal, ownTotal, pendingTotal, isHq }
}

export interface ExpenseInput { kind: 'salary' | 'current'; who?: string; article?: string; expenseArticleId?: string; accountId: string; amount: number; date: string }

export async function addShiftExpense(orgId: string, input: ExpenseInput, _actor?: Session | null) {
  if (!input.accountId || !(num(input.amount) > 0)) return { ok: false as const, error: 'Укажите счёт и сумму' }
  const article = input.kind === 'salary' ? 'ЗП' : (input.article || 'Текущий расход')
  return saveFinRow(orgId, { date: input.date, type: 'etc', article, who: input.who || '', expenseArticleId: input.expenseArticleId || null, amounts: [{ accountId: input.accountId, amount: -Math.abs(num(input.amount)) }] })
}

// Оплатить ЗП списком (разом): по каждому сотруднику с суммой>0 — расходная строка ЗП с одного счёта.
export async function payWages(orgId: string, accountId: string, items: Array<{ who: string; amount: number }>, date: string, _actor?: Session | null) {
  if (!accountId) return { ok: false as const, error: 'Выберите счёт списания' }
  const use = (items || []).filter(i => num(i.amount) > 0)
  if (!use.length) return { ok: false as const, error: 'Укажите суммы ЗП' }
  let total = 0
  for (const i of use) { await saveFinRow(orgId, { date, type: 'etc', article: 'ЗП', who: i.who || '', amounts: [{ accountId, amount: -Math.abs(num(i.amount)) }] }); total += Math.abs(num(i.amount)) }
  return { ok: true as const, count: use.length, total }
}

// ── ТАБЕЛЬ (начисление) и ВЫПЛАТА ЗП+40% ────────────────────────────────────────
// Отметки «кто на смене» за день (деньги не трогаются).
export async function listShiftMarks(orgId: string, date: string) {
  const rows = await attendance.listMarks(orgId, date)
  return { ok: true as const, ids: rows.map((r: any) => r.employeeId) }
}
export async function setShiftMarks(orgId: string, date: string, ids: string[]) {
  const saved = await attendance.setMarks(orgId, date, ids || [])
  return { ok: true as const, ids: saved }
}

// ЗП сотрудника за ЭТОТ день вписана руками (правило владельца 13.11.2026). Пусто/0 → снова
// дневной оклад. Это НАЧИСЛЕНИЕ: деньги не двигаются, но отсюда считается выплата ЗП+40%,
// колонка ЗП отчёта дня и месячный свод.
export async function setShiftWage(orgId: string, date: string, employeeId: string, amount: number | null) {
  if (!employeeId) return { ok: false as const, error: 'Не указан сотрудник' }
  const val = amount == null || !Number.isFinite(amount) || amount <= 0 ? null : Math.round(num(amount) * 100) / 100
  const ok = await attendance.setMarkAmount(orgId, date, employeeId, val)
  if (!ok) return { ok: false as const, error: 'Сначала отметьте сотрудника на смене' }
  return { ok: true as const, amount: val }
}

// Реальная выплата ЗП+40% отмеченным на смене: по каждому сумма = оклад (из табеля) + бонус,
// который АДМИН вписывает ВРУЧНУЮ (40% маржи он делит сам, как захочет). Пишет fin_rows
// article='ЗП' (posted, деньги out со счёта, who=имя). Идемпотентно: по сотрудникам, у кого за
// этот день уже есть строка ЗП, выплата не повторяется.
export async function payShiftZp(orgId: string, date: string, accountId: string, bonuses: Array<{ employeeId: string; amount: number }>, _actor?: Session | null, splits?: Array<{ accountId: string; amount: number }>) {
  // splits — отмеченные счета и сколько снять с каждого (на одном счёте может не хватать).
  // Пусто → старое поведение: всё с одного accountId.
  const pool = (splits || []).filter(x => x?.accountId && num(x.amount) > 0).map(x => ({ accountId: String(x.accountId), left: Math.round(num(x.amount)) }))
  if (!pool.length && !accountId) return { ok: false as const, error: 'Выберите счёт списания' }
  const marks = await attendance.listMarks(orgId, date)
  const attSet = new Set(marks.map((r: any) => r.employeeId))
  // ЗП дня: вписанная руками в табеле, иначе дневной оклад сотрудника.
  const wageMap: Record<string, number | null> = {}
  for (const r of marks as any[]) wageMap[r.employeeId] = r.amount == null ? null : num(r.amount)
  if (!attSet.size) return { ok: false as const, error: 'Отметьте в табеле кто на смене' }
  const staff = await sqlClient`select id::text, name, daily_wage::float "dailyWage" from employees where org_id=${orgId} and archived=false` as unknown as Array<any>
  const marked = staff.filter((u: any) => attSet.has(u.id))
  const bonusMap: Record<string, number> = {}; for (const b of (bonuses || [])) bonusMap[String(b.employeeId)] = Math.max(0, Math.round(num(b.amount)))
  // Кому ЗП за этот день уже выдана (любая строка ЗП, draft или posted) — не дублируем.
  const paidRows = await sqlClient`select distinct lower(trim(who)) who from fin_rows where org_id=${orgId} and date=${date} and article='ЗП'` as unknown as Array<any>
  const paidSet = new Set(paidRows.map((r: any) => r.who).filter(Boolean))
  const items = marked.map((u: any) => { const oklad = Math.round(wageMap[u.id] != null ? (wageMap[u.id] as number) : num(u.dailyWage)); const bonus = bonusMap[u.id] || 0; return { who: u.name, oklad, bonus, total: oklad + bonus } })
  const toPay = items.filter((i: any) => i.total > 0 && !paidSet.has((i.who || '').trim().toLowerCase()))
  if (!toPay.length) return { ok: false as const, error: 'ЗП+40% за этот день уже выдана' }
  const fin = await import('../repositories/fin.repo')
  const need = toPay.reduce((s: number, i: any) => s + i.total, 0)
  const have = pool.reduce((s, p) => s + p.left, 0)
  if (pool.length && have + 0.5 < need) return { ok: false as const, error: `Распределено ${have} из ${need} — не хватает ${need - have}` }
  // Списание по отмеченным счетам по порядку: закончился один — добираем со следующего.
  const take = (sum: number) => {
    const out: Array<{ accountId: string; amount: number }> = []
    let rest = sum
    for (const p of pool) { if (rest <= 0) break; const t = Math.min(p.left, rest); if (t <= 0) continue; p.left -= t; rest -= t; out.push({ accountId: p.accountId, amount: -t }) }
    if (rest > 0) out.push({ accountId: pool[pool.length - 1]?.accountId || accountId, amount: -rest })
    return out
  }
  let total = 0
  for (const i of toPay) {
    const amounts = pool.length ? take(Math.abs(i.total)) : [{ accountId, amount: -Math.abs(i.total) }]
    const r: any = await saveFinRow(orgId, { date, type: 'etc', article: 'ЗП', who: i.who, amounts })
    if (r?.id) await fin.setPosted([r.id])
    total += i.total
  }
  return { ok: true as const, count: toPay.length, total, items: toPay }
}

// Инкассация «мастер → филиал»: нал + KASPI GOLD мастера → Банковский счёт филиала (проведённый mv).
export async function incassate(orgId: string, cash: number, kaspi: number, date: string, _actor?: Session | null) {
  const c = Math.max(0, num(cash)), k = Math.max(0, num(kaspi))
  if (c + k <= 0) return { ok: false as const, error: 'Укажите сумму инкассации' }
  const fd = await financeDay(orgId, date)
  const gold = findAcc(fd.accounts || [], 'KASPI GOLD'), cashA = findAcc(fd.accounts || [], 'Основная касса'), bank = findAcc(fd.accounts || [], 'Банковский счет')
  if (!bank) return { ok: false as const, error: 'Не найден Банковский счёт' }
  const amounts: any[] = [{ accountId: bank.id, amount: c + k }]
  if (c > 0 && cashA) amounts.push({ accountId: cashA.id, amount: -c })
  if (k > 0 && gold) amounts.push({ accountId: gold.id, amount: -k })
  const r: any = await saveFinRow(orgId, { date, type: 'mv', article: 'Инкассация: мастер → филиал', amounts })
  if (r?.id) { const fin = await import('../repositories/fin.repo'); await fin.setPosted([r.id]) }
  return { ok: true as const, cash: c, kaspi: k }
}
// Инкассация «Нипа → головной» СО СПЛИТОМ по счетам (как просил владелец):
//  • нал (Осн.касса Нипы) → Основная касса ГОЛОВНОГО
//  • каспи GOLD (KASPI GOLD Нипы) → Банковский счёт ГОЛОВНОГО
// У Нипы деньги уходят (payments out на мост → гасят долг перед головным), у головного приходят
// (payments in от обратного моста на его счета). Так деньги делятся между счетами Нипа↔головной.
export async function remitToHQ(orgId: string, cash: number, kaspi: number, date: string, actor?: Session | null) {
  const c = Math.max(0, num(cash)), k = Math.max(0, num(kaspi))
  if (c + k <= 0) return { ok: false as const, error: 'Укажите сумму (нал и/или каспи)' }
  const bridge = (await sqlClient`select c.id::text id, o.id::text hq from contragents c join organizations o on o.id=c.org_ref_id and o.kind='hq' where c.org_id=${orgId} limit 1` as unknown as Array<any>)[0]
  if (!bridge) return { ok: false as const, error: 'Не найден контрагент-головной' }
  const hqId = bridge.hq as string
  const back = (await sqlClient`select id::text id from contragents where org_id=${hqId} and org_ref_id=${orgId} and archived=false limit 1` as unknown as Array<any>)[0]
  const npAcc = await sqlClient`select id::text id, name from cash_accounts where org_id=${orgId} and archived=false` as unknown as Array<any>
  const hqAcc = await sqlClient`select id::text id, name from cash_accounts where org_id=${hqId} and archived=false` as unknown as Array<any>
  const npCash = findAcc(npAcc, 'Основная касса'), npGold = findAcc(npAcc, 'KASPI GOLD')
  const hqCash = findAcc(hqAcc, 'Основная касса'), hqBank = findAcc(hqAcc, 'Банковский счет')
  const { randomUUID } = await import('crypto')
  const payRepo = await import('../repositories/payment.repo')
  const mk = (oid: string, cid: string, dir: string, amt: number, accId: string | null, comment: string) =>
    payRepo.insertPayment({ id: randomUUID(), orgId: oid, contragentId: cid, direction: dir, amount: String(amt), date, cashAccountId: accId || null, comment } as any)
  const who = actor?.name ? ' · ' + actor.name : ''
  // Нипа: уходит нал (с Осн.кассы) и каспи (с KASPI GOLD) → мост (гасит долг перед головным).
  if (c > 0) await mk(orgId, bridge.id, 'out', c, npCash?.id || null, `Инкассация головному · нал${who}`)
  if (k > 0) await mk(orgId, bridge.id, 'out', k, npGold?.id || null, `Инкассация головному · каспи${who}`)
  // Головной: приходит нал → Осн.касса ГО, каспи → Банковский счёт ГО (от обратного моста).
  if (back) {
    if (c > 0) await mk(hqId, back.id, 'in', c, hqCash?.id || null, `Инкассация от «${orgId}» · нал`)
    if (k > 0) await mk(hqId, back.id, 'in', k, hqBank?.id || null, `Инкассация от «${orgId}» · каспи`)
  }
  return { ok: true as const, cash: c, kaspi: k }
}

// Отмена инкассации «филиал → головной» за день: удаляем ОБЕ проводки пары (расход филиала
// на мост + приход головного от обратного моста). Авто-инкассацию магазина (другие комментарии)
// не трогаем. Нужна, когда сдали не ту сумму / не тот счёт — иначе деньги не вернуть из кабинета.
export async function remitUndo(orgId: string, date: string, _actor?: Session | null) {
  const bridge = (await sqlClient`select o.id::text hq from contragents c join organizations o on o.id=c.org_ref_id and o.kind='hq' where c.org_id=${orgId} limit 1` as unknown as Array<any>)[0]
  if (!bridge) return { ok: false as const, error: 'Не найден контрагент-головной' }
  const del = await sqlClient`delete from payments where date = ${date}
    and ((org_id = ${orgId} and direction = 'out' and comment like 'Инкассация головному%')
      or (org_id = ${bridge.hq} and direction = 'in' and comment like ${'Инкассация от «' + orgId + '»%'}))
    returning amount::numeric amount` as unknown as Array<any>
  if (!del.length) return { ok: false as const, error: 'За этот день инкассации головному нет' }
  const total = del.reduce((x: number, r: any) => x + Number(r.amount), 0) / 2
  return { ok: true as const, removed: del.length, total }
}

// «↩ Вернуть деньги от головного»: выручка уже сдана (инкассация), а на ЗП/расход денег нет.
// Одно действие филиала: выбрать СВОЙ счёт + сумму. Пишем пару проводок — у головного расход
// с его счёта на обратный мост (долг филиала перед ГО растёт), у филиала приход на выбранный
// счёт от моста-головного. Обе строки сами появляются в листе «Деньги» своей орг (операция
// возврата у головного + движение по счёту), поэтому отдельный документ не создаём.
export async function returnFromHQ(orgId: string, accountId: string, amount: number, date: string, actor?: Session | null) {
  const a = Math.round(num(amount))
  if (!(a > 0)) return { ok: false as const, error: 'Укажите сумму возврата' }
  const [acc] = await sqlClient`select id::text id, name from cash_accounts where id=${accountId} and org_id=${orgId} and archived=false limit 1` as unknown as Array<any>
  if (!acc) return { ok: false as const, error: 'Счёт филиала не найден' }
  const bridge = (await sqlClient`select c.id::text id, o.id::text hq from contragents c join organizations o on o.id=c.org_ref_id and o.kind='hq' where c.org_id=${orgId} limit 1` as unknown as Array<any>)[0]
  if (!bridge) return { ok: false as const, error: 'Не найден контрагент-головной' }
  const hqId = bridge.hq as string
  const back = (await sqlClient`select id::text id from contragents where org_id=${hqId} and org_ref_id=${orgId} and archived=false limit 1` as unknown as Array<any>)[0]
  if (!back) return { ok: false as const, error: 'У головного нет контрагента этого филиала' }
  const orgName = (await sqlClient`select name from organizations where id=${orgId} limit 1` as unknown as Array<any>)[0]?.name || 'филиал'
  // Счёт-источник у головного: одноимённый, иначе банковский (каспи/QR филиала — это деньги ГО на банке).
  const hqAcc = await sqlClient`select id::text id, name from cash_accounts where org_id=${hqId} and archived=false` as unknown as Array<any>
  const src = findAcc(hqAcc, acc.name) || findAcc(hqAcc, 'Банковский счет') || hqAcc[0]
  const { randomUUID } = await import('crypto')
  const payRepo = await import('../repositories/payment.repo')
  const mk = (oid: string, cid: string, dir: string, accId: string | null, comment: string) =>
    payRepo.insertPayment({ id: randomUUID(), orgId: oid, contragentId: cid, direction: dir, amount: String(a), date, cashAccountId: accId || null, comment } as any)
  const who = actor?.name ? ' · ' + actor.name : ''
  await mk(hqId, back.id, 'out', src?.id || null, `Возврат филиалу «${orgName}» · ${acc.name}${who}`)
  await mk(orgId, bridge.id, 'in', acc.id, `Возврат от головного · ${acc.name}${who}`)
  return { ok: true as const, amount: a, to: acc.name, from: src?.name || '' }
}

// Отмена возврата за день: снимаем ОБЕ проводки пары (приход филиала + расход головного).
export async function returnUndo(orgId: string, date: string, _actor?: Session | null) {
  const bridge = (await sqlClient`select o.id::text hq from contragents c join organizations o on o.id=c.org_ref_id and o.kind='hq' where c.org_id=${orgId} limit 1` as unknown as Array<any>)[0]
  if (!bridge) return { ok: false as const, error: 'Не найден контрагент-головной' }
  const orgName = (await sqlClient`select name from organizations where id=${orgId} limit 1` as unknown as Array<any>)[0]?.name || ''
  const del = await sqlClient`delete from payments where date = ${date}
    and ((org_id = ${orgId} and direction = 'in' and comment like 'Возврат от головного%')
      or (org_id = ${bridge.hq} and direction = 'out' and comment like ${'Возврат филиалу «' + orgName + '»%'}))
    returning amount::numeric amount` as unknown as Array<any>
  if (!del.length) return { ok: false as const, error: 'За этот день возвратов от головного нет' }
  const total = del.reduce((x: number, r: any) => x + Number(r.amount), 0) / 2
  return { ok: true as const, removed: del.length, total }
}

export async function closeMasterShift(orgId: string, date: string, actor?: Session | null) {
  return postFinDay(orgId, date, actor?.id)
}
