import { NextRequest, NextResponse } from 'next/server'
import { createOrderSchema } from '@/dto/order.dto'
import { createOrder, listForClient } from '@/services/order.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'
import * as refsRepo from '@/repositories/refs.repo'
import { contragentByOrgRef } from '@/repositories/document.repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  return NextResponse.json(await listForClient(t.orgId, t.id, t.contragentId))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  // Кабинет: заявка всегда от имени клиента, продажа, во Входящие.
  // uid — админ создаёт «от имени» кабинета (resolveTarget), иначе сам пользователь.
  // Точная связка: если кабинет привязан к контрагенту — заявка идёт на него (contactId).
  // Заказ мастера производства обязан иметь заказчика (запрет карточки без имени заказчика).
  if (body?.prodOrder && !body?.contactId) return NextResponse.json({ error: 'Выберите заказчика' }, { status: 400 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))
  // Форма заказа кабинета (что филиалу/клиенту нужно) уходит ГОЛОВНОМУ — он получает заявку и
  // собирает автозакуп. Заказ мастера на производство (prodOrder) остаётся у филиала (свой цикл).
  let targetOrg = t.orgId
  let contactId = body.contactId || t.contragentId || undefined
  if (!body?.prodOrder) {
    const hq = (await refsRepo.listOrganizations() as any[]).find(o => o.kind === 'hq')
    if (hq && hq.id !== t.orgId) {
      targetOrg = hq.id
      // Заказчик в книге головного = мост-контрагент на орг кабинета (ГО знает, кто заказал).
      const [bridge] = await contragentByOrgRef(hq.id, t.orgId)
      contactId = body.contactId || bridge?.id || undefined
    }
  }
  const parsed = createOrderSchema.safeParse({ ...body, orgId: targetOrg, kind: 'sale', source: 'cabinet', fromId: t.id, fromName: t.name, contactId })
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте позиции' }, { status: 400 })
  const res = await createOrder(parsed.data, s)
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
