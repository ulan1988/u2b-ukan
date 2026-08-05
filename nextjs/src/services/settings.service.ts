import * as repo from '../repositories/settings.repo'

// Сводка для панели Фильтр (канбан-колонки): поставщики, проекты, спецпроекты (с items).
export async function settingsBundle(orgId: string) {
  const [suppliers, projects, specs] = await Promise.all([
    repo.suppliers(orgId), repo.projectsByOrg(orgId), repo.specProjectsByOrg(orgId),
  ])
  const items = await repo.specItemsByProjects(specs.map(s => s.id))
  const byProject: Record<string, any[]> = {}
  for (const it of items) (byProject[it.specProjectId] ||= []).push(it)
  const specProjects = specs.map(s => ({ ...s, items: byProject[s.id] || [] }))
  return { suppliers, projects, specProjects }
}
