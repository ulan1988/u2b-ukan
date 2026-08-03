'use client'
import { useEffect, useState } from 'react'
import { getOrgId, setOrgId } from '@/lib/org'

export default function OrgSwitcher() {
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [cur, setCur] = useState('')

  useEffect(() => {
    fetch('/api/refs').then(r => r.json()).then(r => {
      setOrgs(r.organizations || [])
      setCur(getOrgId() || r.organizations?.[0]?.id || '')
    }).catch(() => {})
  }, [])

  if (orgs.length <= 1) return null
  return (
    <select
      value={cur}
      onChange={e => { setOrgId(e.target.value); location.reload() }}
      className="ml-auto border border-neutral-300 rounded-lg px-2 py-1 text-sm font-semibold bg-white outline-none"
      title="Организация"
    >
      {orgs.map(o => <option key={o.id} value={o.id}>🏢 {o.name}</option>)}
    </select>
  )
}
