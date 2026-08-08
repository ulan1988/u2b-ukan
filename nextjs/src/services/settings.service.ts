import { randomUUID } from 'crypto'
import * as repo from '../repositories/settings.repo'

export async function createProject(orgId: string, name: string, clientId?: string) {
  const [p] = await repo.insertProject({ orgId, name, clientId: clientId ?? null })
  return p
}

export async function createSpecProject(orgId: string, name: string, items: { name: string; qty: number; unit?: string }[]) {
  const id = randomUUID()
  await repo.insertSpecProject({ id, orgId, name })
  await repo.insertSpecItems(items.filter(i => i.name).map(i => ({ specProjectId: id, name: i.name, qty: String(i.qty || 0), unit: i.unit || 'шт' })))
  return { id, name }
}

// Сводка для панели Фильтр (канбан-колонки): поставщики, проекты, спецпроекты (с items).
export async function settingsBundle(orgId: string) {
  const [suppliers, projects, specs, defaults] = await Promise.all([
    repo.suppliers(orgId), repo.projectsByOrg(orgId), repo.specProjectsByOrg(orgId), repo.orgDefaults(orgId),
  ])
  const items = await repo.specItemsByProjects(specs.map(s => s.id))
  const byProject: Record<string, any[]> = {}
  for (const it of items) (byProject[it.specProjectId] ||= []).push(it)
  const specProjects = specs.map(s => ({ ...s, items: byProject[s.id] || [] }))
  return { suppliers, projects, specProjects, defaultLogistId: defaults.defaultLogistId, defaultContragentId: defaults.defaultContragentId }
}

export const setDefaultLogist = (orgId: string, userId: string | null) => repo.setOrgDefaultLogist(orgId, userId || null)
export const setDefaultContragent = (orgId: string, contragentId: string | null) => repo.setOrgDefaultContragent(orgId, contragentId || null)
