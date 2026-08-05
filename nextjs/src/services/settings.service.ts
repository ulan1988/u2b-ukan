import * as repo from '../repositories/settings.repo'

// Сводка для панели Фильтр (канбан-колонки): поставщики, проекты, спецпроекты.
// specProjects пока пуст (таблицы спецпроектов ещё нет) — структура готова.
export async function settingsBundle(orgId: string) {
  const [suppliers, projects] = await Promise.all([repo.suppliers(orgId), repo.projectsByOrg(orgId)])
  return { suppliers, projects, specProjects: [] as any[] }
}
