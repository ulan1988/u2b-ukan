// Дашборд: сборка сводки по организации (KPI, поток по стадиям, внимание, топ-клиенты,
// последние события, спецпроекты). Один снимок заявок+позиций, всё считается в памяти —
// как в Улкане, но со скоупом по организации (переключатель филиалов в шапке).
import * as orderRepo from '../repositories/order.repo'
import * as dashRepo from '../repositories/dashboard.repo'

const num = (v: any) => Number(v || 0)

// Прогресс позиции: доставлено=100, в пути=60, готово=30, иначе 0 (как posPct Улкана).
function posPct(p: any) {
  const s = p.status
  if (s === 'Доставлено') return 100
  if (s === 'В пути') return 60
  if (s === 'Готово') return 30
  return 0
}

export async function overview(orgId: string) {
  const allOrders = await orderRepo.listByOrg(orgId)
  const ids = allOrders.map((o: any) => o.id)
  const [posList, activity, specs] = await Promise.all([
    orderRepo.positionsByCards(ids),
    orderRepo.historyByOrg(orgId, {}, 8),
    dashRepo.activeSpecProjects(orgId),
  ])
  const specIds = specs.map((s: any) => s.id)
  const specItems = await dashRepo.specItems(specIds)

  // позиции по карточке
  const posBy: Record<string, any[]> = {}
  for (const p of posList) (posBy[p.cardId] ||= []).push(p)
  const posOf = (o: any) => posBy[o.id] || []

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const deliveredTodayCard = (o: any) => o.delivered && new Date(o.delivered) >= today && new Date(o.delivered) < tomorrow
  const isOverdueCard = (o: any) => posOf(o).some((p: any) => p.late && p.status !== 'Доставлено')

  // KPI
  const active = allOrders.filter((o: any) => !o.isDraft && !o.isCancelled && o.screen !== 'archive').length
  const deliveredToday = allOrders.filter(deliveredTodayCard).length
  const overdue = allOrders.filter(isOverdueCard).length
  const inwork = allOrders.filter((o: any) => o.screen === 'outgoing').length
  const turnoverToday = allOrders.filter(deliveredTodayCard)
    .reduce((s: number, o: any) => s + posOf(o).reduce((ps: number, p: any) => ps + num(p.qty) * num(p.price), 0), 0)

  // Поток по стадиям — считаем как показывают экраны: toacc-карточки идут в «К учёту», не во «Входящие».
  const flow = {
    incoming: allOrders.filter((o: any) => o.screen === 'incoming' && !o.toacc && !o.isDraft && !o.isCancelled).length,
    reception: allOrders.filter((o: any) => o.screen === 'reception').length,
    outgoing: allOrders.filter((o: any) => o.screen === 'outgoing').length,
    accounting: allOrders.filter((o: any) => (o.screen === 'incoming' && o.toacc) || o.screen === 'accounting').length,
    bookkeeping: allOrders.filter((o: any) => o.screen === 'bookkeeping').length,
    archive: allOrders.filter((o: any) => o.screen === 'archive').length,
  }

  // Общий прогресс работающих карточек
  const workOrders = allOrders.filter((o: any) => !o.isDraft && !o.isCancelled && o.screen !== 'archive')
  const overallPct = workOrders.length > 0
    ? Math.round(workOrders.reduce((s: number, o: any) => {
        const ps = posOf(o)
        const pct = ps.length > 0
          ? ps.reduce((a: number, p: any) => a + posPct(p), 0) / ps.length
          : (o.status === 'Доставлено' ? 100 : 0)
        return s + pct
      }, 0) / workOrders.length)
    : 0

  // Топ клиенты (по числу заявок)
  const clientMap: Record<string, number> = {}
  for (const o of allOrders) clientMap[o.fromName || '—'] = (clientMap[o.fromName || '—'] || 0) + 1
  const totalOrders = allOrders.length
  const topClients = Object.entries(clientMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count, pct: Math.round(count / (totalOrders || 1) * 100) }))

  // Блоки внимания
  const attention: Array<{ label: string; sub: string; tag: string; hue: string; screen: string }> = []
  const changed = allOrders.filter((o: any) => o.isChanged && !o.isCancelled)
  if (changed.length > 0) attention.push({ label: `${changed.length} изменений от клиентов`, sub: 'Требуют подтверждения', tag: 'isChanged', hue: '#c0532a', screen: 'incoming' })
  if (overdue > 0) attention.push({ label: `${overdue} просроченных`, sub: 'Позиции с нарушением срока', tag: 'late', hue: '#b03020', screen: 'outgoing' })
  const toaccList = allOrders.filter((o: any) => o.toacc && o.screen === 'incoming')
  if (toaccList.length > 0) attention.push({ label: `${toaccList.length} к учёту`, sub: 'Готовы к проводке', tag: 'toacc', hue: '#2e8a5e', screen: 'accounting' })

  // СпецПроекты с прогрессом (собрано qty позиций / нужно qty позиций спеки)
  const itemsBy: Record<string, any[]> = {}
  for (const it of specItems) (itemsBy[it.specProjectId] ||= []).push(it)
  const cardsBy: Record<string, number> = {}
  const collectedBy: Record<string, number> = {}
  for (const o of allOrders) {
    if (!o.specProjectId) continue
    cardsBy[o.specProjectId] = (cardsBy[o.specProjectId] || 0) + 1
    collectedBy[o.specProjectId] = (collectedBy[o.specProjectId] || 0) + posOf(o).reduce((s: number, p: any) => s + num(p.qty), 0)
  }
  const specProjects = specs.map((sp: any) => {
    const needed = (itemsBy[sp.id] || []).reduce((s: number, i: any) => s + num(i.qty), 0)
    const collected = collectedBy[sp.id] || 0
    const pct = needed > 0 ? Math.round(Math.min(collected / needed * 100, 100)) : 0
    return { id: sp.id, name: sp.name, pct, cardCount: cardsBy[sp.id] || 0 }
  })

  return {
    kpi: { active, deliveredToday, overdue, inwork, turnoverToday },
    flow,
    progress: { overallPct, inwork, delivered: deliveredToday, overdue },
    attention,
    activity,
    topClients,
    specProjects,
  }
}
