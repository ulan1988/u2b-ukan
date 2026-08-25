// Финансовые агрегаты — «сырой» SQL через neon-клиент (параметризованно и быстро).
import { sqlClient } from '../lib/db'

// Итоги по орг: продажи, закупы, оплаты in/out, стоимость склада (по priceIn).
export async function totals(orgId: string) {
  const r = await sqlClient`
    select
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='sale'       and status<>'cancelled')::float as sales,
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='purchase'   and status<>'cancelled')::float as purchases,
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='return_in'  and status<>'cancelled')::float as ret_in,
      (select coalesce(sum(total),0) from documents where org_id=${orgId} and type='return_out' and status<>'cancelled')::float as ret_out,
      (select coalesce(sum(amount),0) from payments where org_id=${orgId} and direction='in')::float as pay_in,
      (select coalesce(sum(amount),0) from payments where org_id=${orgId} and direction='out')::float as pay_out,
      (select coalesce(sum(sm.qty * p.price_in),0) from stock_movements sm join products p on p.id=sm.product_id where sm.org_id=${orgId})::float as stock_value`
  return r[0] as { sales: number; purchases: number; ret_in: number; ret_out: number; pay_in: number; pay_out: number; stock_value: number }
}

// Рентабельность по продажам (как в 1С): выручка − себестоимость.
// Себестоимость = связанные партии закупа (doc_link × цена закупа) + остаток по priceIn.
export async function profitReport(orgId: string) {
  return sqlClient`
    with pline as (
      select document_id, product_id, sum(qty) qty, sum(amount) amount
      from document_lines where role='main' group by document_id, product_id
    ),
    linked as (
      select dl.sale_doc_id, dl.product_id,
        sum(dl.qty) as lqty,
        sum(dl.qty * (pl.amount / nullif(pl.qty,0))) as lcost
      from doc_links dl
      join pline pl on pl.document_id=dl.purchase_doc_id and pl.product_id=dl.product_id
      group by dl.sale_doc_id, dl.product_id
    ),
    saleline as (
      select sl.document_id, sl.product_id, sum(sl.qty) as sqty
      from document_lines sl
      join documents d on d.id=sl.document_id and d.type='sale'
      where sl.role='main' group by sl.document_id, sl.product_id
    ),
    cost as (
      select s.document_id as sale_id,
        coalesce(l.lcost,0) + greatest(s.sqty - coalesce(l.lqty,0),0) * p.price_in as line_cost
      from saleline s
      join products p on p.id=s.product_id
      left join linked l on l.sale_doc_id=s.document_id and l.product_id=s.product_id
    )
    select d.id, d.number, d.date::text as date, c.name as client,
      d.total::float as revenue,
      coalesce(sum(cost.line_cost),0)::float as cost
    from documents d
    left join contragents c on c.id=d.contragent_id
    left join cost on cost.sale_id=d.id
    where d.org_id=${orgId} and d.type='sale' and d.status<>'cancelled'
      and coalesce(d.operation,'') <> 'opening1c'   -- исторический импорт 1С (акт сверки) не в рентабельность
    group by d.id, d.number, d.date, c.name, d.total
    order by d.date desc, d.created_at desc` as unknown as Promise<Array<{ id: string; number: string; date: string; client: string | null; revenue: number; cost: number }>>
}

// Рентабельность ПО ТОВАРУ за период: выручка − себестоимость (FIFO закупа + непокрытая ×price_in).
export async function profitByProduct(orgId: string, from?: string, to?: string) {
  const f = from || null, t = to || null
  return sqlClient`
    with pline as (
      select document_id, product_id, sum(qty) qty, sum(amount) amount
      from document_lines where role='main' group by document_id, product_id
    ),
    saleline as (
      select sl.product_id, sl.document_id, sum(sl.qty) sqty, sum(sl.amount) samount
      from document_lines sl
      join documents d on d.id=sl.document_id and d.type='sale' and d.status<>'cancelled' and coalesce(d.operation,'')<>'opening1c'
      where sl.role='main' and d.org_id=${orgId}
        and (${f}::date is null or d.date >= ${f}::date)
        and (${t}::date is null or d.date <= ${t}::date)
      group by sl.product_id, sl.document_id
    ),
    linked as (
      select dl.sale_doc_id, dl.product_id, sum(dl.qty) lqty, sum(dl.qty*(pl.amount/nullif(pl.qty,0))) lcost
      from doc_links dl join pline pl on pl.document_id=dl.purchase_doc_id and pl.product_id=dl.product_id
      group by dl.sale_doc_id, dl.product_id
    )
    select s.product_id::text id, pr.name,
      sum(s.sqty)::float qty, sum(s.samount)::float revenue,
      sum(coalesce(l.lcost,0) + greatest(s.sqty-coalesce(l.lqty,0),0)*pr.price_in)::float cost
    from saleline s
    join products pr on pr.id=s.product_id
    left join linked l on l.sale_doc_id=s.document_id and l.product_id=s.product_id
    group by s.product_id, pr.name
    order by revenue desc` as unknown as Promise<Array<{ id: string; name: string; qty: number; revenue: number; cost: number }>>
}

// Нач. остаток контрагента (для выписки).
export async function contragentOpening(orgId: string, contragentId: string) {
  const r = await sqlClient`select coalesce(opening_balance,0)::float op from contragents where id=${contragentId} and org_id=${orgId}` as unknown as Array<{ op: number }>
  return r[0]?.op ?? 0
}

// Все документы (накладные/возвраты) одного контрагента — для выписки в кабинете.
export async function contragentDocs(orgId: string, contragentId: string) {
  return sqlClient`
    select id, number, type, date::text as date, total::float as total, status
    from documents
    where org_id=${orgId} and contragent_id=${contragentId}
      and type in ('sale','purchase','return_in','return_out') and status<>'cancelled'
    order by date desc, created_at desc` as unknown as Promise<Array<{ id: string; number: string; type: string; date: string; total: number; status: string }>>
}

// Разбивка оборота контрагента по проектам (через карточку-основание документа: sourceOrderId → order.projectId).
// «сколько ушло на проект»: сумма расходных (продажи) − возвраты, по каждому проекту клиента.
export async function contragentProjectTotals(orgId: string, contragentId: string) {
  return sqlClient`
    select coalesce(pr.id::text,'') as "projectId",
           coalesce(pr.name,'— без проекта —') as name,
           sum(case when d.type in ('sale','return_out') then d.total::float else -d.total::float end) as total,
           count(*)::int as cnt
    from documents d
    left join orders o on o.id = d.source_order_id
    left join spec_projects pr on pr.id = coalesce(d.project_id, o.spec_project_id)
    where d.org_id=${orgId} and d.contragent_id=${contragentId}
      and d.type in ('sale','purchase','return_in','return_out') and d.status<>'cancelled'
    group by pr.id, pr.name
    order by total desc` as unknown as Promise<Array<{ projectId: string; name: string; total: number; cnt: number }>>
}

// Оплаты контрагента по проектам (payments.project_id → spec_projects).
export async function contragentProjectPayments(orgId: string, contragentId: string) {
  return sqlClient`
    select coalesce(pr.id::text,'') as "projectId", coalesce(pr.name,'— без проекта —') as name,
           sum(case when p.direction='in' then p.amount::float else -p.amount::float end) as paid
    from payments p left join spec_projects pr on pr.id = p.project_id
    where p.org_id=${orgId} and p.contragent_id=${contragentId}
    group by pr.id, pr.name` as unknown as Promise<Array<{ projectId: string; name: string; paid: number }>>
}

// ─── Акт сверки ПО ПРОЕКТАМ (выбор нескольких + распределение аванса) ───────────
// Оборот по выбранным проектам (расходные − возвраты), по каждому проекту.
export async function projectsTurnover(orgId: string, ids: string[]) {
  if (!ids.length) return [] as Array<{ projectId: string; total: number; cnt: number }>
  // Оборот = документы клиенту проекта (d.contragent_id = pr.client_id) — так зеркальный
  // закуп филиала (контрагент-мост) в оборот не попадает и не обнуляет продажу.
  return sqlClient`
    select pr.id::text as "projectId",
           sum(case when d.type in ('sale','return_out') then d.total::float else -d.total::float end) as total,
           count(*)::int as cnt
    from documents d
    left join orders o on o.id = d.source_order_id
    join spec_projects pr on pr.id = coalesce(d.project_id, o.spec_project_id)
    where d.org_id=${orgId} and d.status<>'cancelled'
      and d.type in ('sale','purchase','return_in','return_out')
      and pr.id = any(${ids}::uuid[]) and d.contragent_id = pr.client_id
    group by pr.id` as unknown as Promise<Array<{ projectId: string; total: number; cnt: number }>>
}
// Оплаты проекта: платёж относим к проекту по его project_id ИЛИ по документу, который он
// гасит (payments.document_id → doc.project_id / order.spec_project_id). Так оплаты из
// «Финанс/Деньги» (гасят накладную, но без project_id) тоже попадают в проект.
// Фильтр contragent = client проекта — чтобы «оплачено клиентом» (не мостовые/поставщику).
export async function projectsDirectPaid(orgId: string, ids: string[]) {
  if (!ids.length) return [] as Array<{ projectId: string; paid: number }>
  return sqlClient`
    select pr.id::text as "projectId",
           sum(case when p.direction='in' then p.amount::float else -p.amount::float end) as paid
    from payments p
    left join documents d on d.id = p.document_id
    left join orders o on o.id = d.source_order_id
    join spec_projects pr on pr.id = coalesce(p.project_id, d.project_id, o.spec_project_id)
    where p.org_id=${orgId} and pr.id = any(${ids}::uuid[]) and p.contragent_id = pr.client_id
    group by pr.id` as unknown as Promise<Array<{ projectId: string; paid: number }>>
}
// Распределённый аванс по проектам (project_alloc).
export async function projectsAllocated(orgId: string, ids: string[]) {
  if (!ids.length) return [] as Array<{ projectId: string; alloc: number }>
  return sqlClient`
    select a.project_id::text as "projectId", sum(a.amount::float) as alloc
    from project_alloc a
    where a.org_id=${orgId} and a.project_id = any(${ids}::uuid[])
    group by a.project_id` as unknown as Promise<Array<{ projectId: string; alloc: number }>>
}
// Документы выбранных проектов — для детализации в акте.
export async function projectsDocs(orgId: string, ids: string[]) {
  if (!ids.length) return [] as Array<any>
  return sqlClient`
    select pr.id::text as "projectId",
           d.id, d.number, d.type, d.date, d.total::float as total
    from documents d
    left join orders o on o.id = d.source_order_id
    join spec_projects pr on pr.id = coalesce(d.project_id, o.spec_project_id)
    where d.org_id=${orgId} and d.status<>'cancelled'
      and d.type in ('sale','purchase','return_in','return_out')
      and pr.id = any(${ids}::uuid[]) and d.contragent_id = pr.client_id
    order by d.date` as unknown as Promise<Array<any>>
}
// Свободный аванс клиента: оплаты in без проекта и без документа (общий кредит) − распределённое.
export async function clientAdvancePool(orgId: string, clientId: string) {
  const r = await sqlClient`
    select
      (select coalesce(sum(case when direction='in' then amount::float else -amount::float end),0)
         from payments where org_id=${orgId} and contragent_id=${clientId}
           and project_id is null and document_id is null) as advances,
      (select coalesce(sum(amount::float),0)
         from project_alloc where org_id=${orgId} and client_id=${clientId}) as allocated`
  const row: any = (r as any)[0] || {}
  return { advances: Number(row.advances) || 0, allocated: Number(row.allocated) || 0 }
}
export async function listAllocations(orgId: string, clientId: string) {
  return sqlClient`select id, project_id::text as "projectId", amount::float as amount, comment
    from project_alloc where org_id=${orgId} and client_id=${clientId}` as unknown as Promise<Array<{ id: string; projectId: string; amount: number; comment: string }>>
}
// Заменить распределение клиента набором строк (перезапись — так проще перераспределять).
export async function replaceAllocations(orgId: string, clientId: string, rows: Array<{ projectId: string; amount: number; comment?: string }>) {
  const { db } = await import('../lib/db')
  const { projectAlloc } = await import('../db/schema')
  const { and, eq } = await import('drizzle-orm')
  await db.delete(projectAlloc).where(and(eq(projectAlloc.orgId, orgId), eq(projectAlloc.clientId, clientId)))
  const clean = rows.filter(r => r.projectId && Number(r.amount) > 0)
  if (clean.length) await db.insert(projectAlloc).values(clean.map(r => ({ orgId, clientId, projectId: r.projectId, amount: String(r.amount), comment: r.comment || '' })))
  return { ok: true as const }
}

// Оплаты одного контрагента.
export async function contragentPayments(orgId: string, contragentId: string) {
  return sqlClient`
    select id, direction, amount::float as amount, date::text as date, comment
    from payments where org_id=${orgId} and contragent_id=${contragentId}
    order by date desc, created_at desc` as unknown as Promise<Array<{ id: string; direction: string; amount: number; date: string; comment: string | null }>>
}

// Баланс по каждому контрагенту: продажи/закупы и оплаты in/out.
export async function contragentBalances(orgId: string) {
  return sqlClient`
    select c.id, c.name, c.kind,
      coalesce(c.opening_balance,0)::float as opening,
      coalesce(s.total,0)::float  as sales,
      coalesce(p.total,0)::float  as purchases,
      coalesce(ri.total,0)::float as ret_in,
      coalesce(ro.total,0)::float as ret_out,
      coalesce(pi.total,0)::float as pay_in,
      coalesce(po.total,0)::float as pay_out
    from contragents c
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='sale'       and status<>'cancelled' group by contragent_id) s  on s.contragent_id=c.id
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='purchase'   and status<>'cancelled' group by contragent_id) p  on p.contragent_id=c.id
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='return_in'  and status<>'cancelled' group by contragent_id) ri on ri.contragent_id=c.id
    left join (select contragent_id, sum(total) total from documents where org_id=${orgId} and type='return_out' and status<>'cancelled' group by contragent_id) ro on ro.contragent_id=c.id
    left join (select contragent_id, sum(amount) total from payments where org_id=${orgId} and direction='in'  group by contragent_id) pi on pi.contragent_id=c.id
    left join (select contragent_id, sum(amount) total from payments where org_id=${orgId} and direction='out' group by contragent_id) po on po.contragent_id=c.id
    where c.org_id=${orgId} and c.archived=false
    order by c.name` as unknown as Promise<Array<{ id: string; name: string; kind: string; opening: number; sales: number; purchases: number; ret_in: number; ret_out: number; pay_in: number; pay_out: number }>>
}
