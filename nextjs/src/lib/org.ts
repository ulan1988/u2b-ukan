'use client'
// Текущая организация — в localStorage. Все экраны скоупятся по этому orgId.
const KEY = 'u2b_org'

export function getOrgId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(KEY)
}
export function setOrgId(id: string) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, id)
}
// Выбранная орг из списка (по localStorage) или первая.
export function pickOrg<T extends { id: string }>(orgs: T[]): T | undefined {
  const stored = getOrgId()
  return orgs.find(o => o.id === stored) || orgs[0]
}
// Фильтр списка справочника по текущей орг (товары глобальные — без orgId — пропускаем).
export function forOrg<T extends { orgId?: string }>(list: T[] | undefined, orgId: string): T[] {
  return (list || []).filter(x => !x.orgId || x.orgId === orgId)
}
