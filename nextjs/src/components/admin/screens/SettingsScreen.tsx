'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { listUsers, createUser, editUser, deleteUser } from '@/lib/api/auth'
import { fetchRefs, settings as fetchSettings, categoryRules as fetchRules, saveCategoryRule, createProject, createSpecProject } from '@/lib/api/refs'
import { CATALOG_CATEGORIES } from '@/lib/nomCatalog'

const ROLES = [
  { v: 'logist', l: 'Логист' }, { v: 'branch', l: 'Филиал' }, { v: 'client', l: 'Клиент' },
  { v: 'supplier_client', l: 'Поставщик-клиент' }, { v: 'warehouse_manager', l: 'Кладовщик' },
  { v: 'bookkeeper', l: 'Бухгалтер' }, { v: 'admin', l: 'Администратор' },
]
const roleLabel = (v: string) => ROLES.find(r => r.v === v)?.l || v
const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none', width: '100%' }

export default function SettingsScreen({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<'users' | 'autofill' | 'projects'>('users')
  const [users, setUsers] = useState<any[]>([])
  const [orgs, setOrgs] = useState<{ id: string; name: string; kind?: string }[]>([])
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'logist', orgId })
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<any>(null)
  const [copied, setCopied] = useState('')
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const accessUrl = (u: any) => u.role === 'branch' ? `${base}/branch/${u.slug}` : (u.role === 'client' || u.role === 'supplier_client') ? `${base}/client/${u.slug}` : u.role === 'logist' ? `${base}/rsp/${u.slug}` : u.role === 'warehouse_manager' ? `${base}/warehouse/${u.slug}` : ''

  const load = () => listUsers().then(setUsers)
  async function setPriceType(u: any, priceType: string) { await editUser(u.id, { priceType }); load(); setMsg('✓ Тип цены обновлён') }
  async function saveEdit() { if (!editing) return; const r = await editUser(editing.id, editing); if (r.ok) { setEditing(null); load(); setMsg('✓ Сохранено') } }
  async function removeUser(u: any) { if (!confirm(`Отключить пользователя «${u.name}»?`)) return; await deleteUser(u.id); load(); setMsg('✓ Отключён') }
  function copy(url: string, key: string) { navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(''), 2000) }
  useEffect(() => {
    load()
    fetchRefs().then((r: any) => setOrgs(r.organizations || []))
  }, [])

  const orgName = (id: string) => orgs.find(o => o.id === id)?.name || '—'
  const reset = () => setF({ name: '', email: '', password: '', role: 'logist', orgId })

  async function create() {
    setMsg('')
    const r = await createUser(f)
    if (!r.ok) { setMsg('⚠ ' + (r.error || 'Ошибка')); return }
    setMsg('✅ Создан'); reset(); load()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>Настройки</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([['users', 'Пользователи'], ['autofill', 'Автоподстановка'], ['projects', 'Проекты']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : COLORS.textMuted, boxShadow: tab === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
      </div>

      {tab === 'autofill' ? <AutofillPanel orgId={orgId} /> : tab === 'projects' ? <ProjectsPanel orgId={orgId} /> : (
      <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Пользователи</div>

      <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 0 0 1.5px #e6e2dc', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 12 }}>НОВЫЙ ПОЛЬЗОВАТЕЛЬ</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
          <input style={inp} placeholder="Имя" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input style={inp} placeholder="Email (логин)" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <input style={inp} type="password" placeholder="Пароль (мин. 4)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          <select style={inp} value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
          <select style={{ ...inp, gridColumn: '1 / -1' }} value={f.orgId} onChange={e => setF({ ...f, orgId: e.target.value })} title="Организация / филиал">
            <option value="">— организация / филиал —</option>
            {orgs.map(o => <option key={o.id} value={o.id}>🏢 {o.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button disabled={!f.name.trim() || !f.email.trim() || f.password.length < 4 || !f.orgId} onClick={create}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: (!f.name.trim() || !f.email.trim() || f.password.length < 4 || !f.orgId) ? 0.5 : 1 }}>Создать</button>
          {msg && <span style={{ fontSize: 13, color: COLORS.textMuted }}>{msg}</span>}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>ПОЛЬЗОВАТЕЛИ ({users.length})</div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['ИМЯ', 'РОЛЬ', 'ОРГАНИЗАЦИЯ', 'ДОСТУП', 'СТАТУС', 'ТИП ЦЕНЫ', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 14px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map(u => {
              const url = accessUrl(u)
              return (
                <tr key={u.id} style={{ borderTop: '1px solid #f1efec' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.textMuted }}>{roleLabel(u.role)}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.textMuted }}>{orgName(u.orgId)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {url && <><a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: COLORS.primary, textDecoration: 'none', fontWeight: 600 }}>Открыть</a><button onClick={() => copy(url, u.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: 6, fontSize: 13 }} title="Скопировать ссылку">{copied === u.id ? '✓' : '📋'}</button></>}
                    {(u.phone || u.email) && <span style={{ fontSize: 13, color: '#837c72', marginLeft: 8 }}>{u.phone || u.email}</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: u.active ? '#e8f5ee' : '#faeaea', color: u.active ? '#2e8a5e' : '#b03020' }}>{u.active ? 'Активен' : 'Отключён'}</span></td>
                  <td style={{ padding: '10px 14px' }}>
                    {['client', 'supplier_client', 'branch'].includes(u.role)
                      ? <select value={u.priceType || 'retail'} onChange={e => setPriceType(u, e.target.value)} style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #e6e2dc', fontFamily: 'inherit', background: '#fff' }}><option value="retail">Розничная</option><option value="opt">Оптовая</option></select>
                      : <span style={{ fontSize: 13, color: '#837c72' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditing({ ...u })} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>Изменить</button>
                      {u.active && <button onClick={() => removeUser(u)} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #f3d5c6', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#b03020' }}>Отключить</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
      </div>
      )}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="anim-pop" style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Изменить пользователя</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={LBL}>ИМЯ</label><input style={inp} value={editing.name || ''} onChange={e => setEditing((p: any) => ({ ...p, name: e.target.value }))} /></div>
              <div><label style={LBL}>РОЛЬ</label><select style={inp} value={editing.role} onChange={e => setEditing((p: any) => ({ ...p, role: e.target.value }))}>{ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LBL}>EMAIL</label><input style={inp} value={editing.email || ''} onChange={e => setEditing((p: any) => ({ ...p, email: e.target.value }))} /></div>
                <div><label style={LBL}>ТЕЛЕФОН</label><input style={inp} value={editing.phone || ''} onChange={e => setEditing((p: any) => ({ ...p, phone: e.target.value }))} /></div>
              </div>
              <div><label style={LBL}>SLUG (адрес кабинета)</label><input style={inp} value={editing.slug || ''} onChange={e => setEditing((p: any) => ({ ...p, slug: e.target.value }))} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!editing.active} onChange={e => setEditing((p: any) => ({ ...p, active: e.target.checked }))} /><span style={{ fontSize: 14 }}>Активен</span></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
                <button onClick={saveEdit} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Сохранить →</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }

// ─── Автоподстановка: поставщик + логист по 4 категориям каталога ──────────────
function AutofillPanel({ orgId }: { orgId: string }) {
  const [rules, setRules] = useState<Record<string, any>>({})
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [logists, setLogists] = useState<any[]>([])
  const [msg, setMsg] = useState('')

  async function load() {
    const [rl, st, us] = await Promise.all([fetchRules(orgId), fetchSettings(orgId), listUsers()])
    const byCat: Record<string, any> = {}; for (const r of rl) byCat[r.category] = r
    setRules(byCat)
    setSuppliers((st as any).suppliers || [])
    setLogists(us.filter((u: any) => u.role === 'logist' && u.orgId === orgId))
  }
  useEffect(() => { load() }, [orgId])

  async function setRule(category: string, patch: any) {
    setMsg('')
    const cur = rules[category] || {}
    const sup = suppliers.find(s => s.id === (patch.supplierId ?? cur.supplierId))
    const log = logists.find(l => l.id === (patch.respUserId ?? cur.respUserId))
    const body = {
      category,
      supplierId: patch.supplierId ?? cur.supplierId ?? undefined,
      supplierName: sup?.name || '',
      respUserId: patch.respUserId ?? cur.respUserId ?? undefined,
      logistName: log?.name || '',
    }
    const r = await saveCategoryRule(body)
    if (r.ok) { setMsg('✅ Сохранено'); load() }
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Автоподстановка по группе</div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>При «Взять в обработку» позиции получают поставщика и логиста по своей категории. {msg}</div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Категория', 'Поставщик', 'Логист'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 16px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {CATALOG_CATEGORIES.map(cc => {
              const r = rules[cc.key] || {}
              return (
                <tr key={cc.key} style={{ borderTop: '1px solid #f1efec' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{cc.label}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <select style={{ ...inp, minWidth: 200 }} value={r.supplierId || ''} onChange={e => setRule(cc.key, { supplierId: e.target.value })}>
                      <option value="">—</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <select style={{ ...inp, minWidth: 180 }} value={r.respUserId || ''} onChange={e => setRule(cc.key, { respUserId: e.target.value })}>
                      <option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Проекты и Спецпроекты (создание) ─────────────────────────────────────────
function ProjectsPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<any>({ projects: [], specProjects: [] })
  const [pName, setPName] = useState('')
  const [spName, setSpName] = useState('')
  const [spItems, setSpItems] = useState<any[]>([{ name: '', qty: '1', unit: 'шт' }])
  const [msg, setMsg] = useState('')

  const load = () => fetchSettings(orgId).then(setData)
  useEffect(() => { load() }, [orgId])

  async function addProject() {
    if (!pName.trim()) return
    const r = await createProject({ name: pName }); if (r.ok) { setPName(''); setMsg('✅ Проект создан'); load() }
  }
  async function addSpec() {
    if (!spName.trim()) return
    const items = spItems.filter(i => i.name.trim()).map(i => ({ name: i.name, qty: Number(i.qty) || 0, unit: i.unit }))
    const r = await createSpecProject({ name: spName, items }); if (r.ok) { setSpName(''); setSpItems([{ name: '', qty: '1', unit: 'шт' }]); setMsg('✅ Спецпроект создан'); load() }
  }
  const setItem = (i: number, patch: any) => setSpItems(s => s.map((x, j) => j === i ? { ...x, ...patch } : x))

  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>Проекты и спецпроекты видны как колонки в Фильтре. {msg}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 10 }}>ПРОЕКТЫ ({(data.projects || []).length})</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Название проекта" value={pName} onChange={e => setPName(e.target.value)} />
            <button onClick={addProject} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>＋</button>
          </div>
          {(data.projects || []).map((p: any) => <div key={p.id} style={{ padding: '7px 0', borderTop: '1px solid #f6f3f0', fontSize: 14 }}>{p.name}</div>)}
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 10 }}>СПЕЦПРОЕКТЫ ({(data.specProjects || []).length})</div>
          <input style={{ ...inp, marginBottom: 8 }} placeholder="Название спецпроекта" value={spName} onChange={e => setSpName(e.target.value)} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#837c72', marginBottom: 6 }}>СМЕТА</div>
          {spItems.map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 28px', gap: 6, marginBottom: 6 }}>
              <input style={inp} placeholder="Товар" value={it.name} onChange={e => setItem(i, { name: e.target.value })} />
              <input style={inp} type="number" placeholder="кол" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} />
              <button onClick={() => setSpItems(s => s.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#b0a99f', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ))}
          <button onClick={() => setSpItems(s => [...s, { name: '', qty: '1', unit: 'шт' }])} style={{ background: 'none', border: 'none', color: COLORS.primary, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>＋ позиция сметы</button>
          <div><button onClick={addSpec} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Создать спецпроект</button></div>
          <div style={{ marginTop: 10 }}>{(data.specProjects || []).map((s: any) => <div key={s.id} style={{ padding: '5px 0', borderTop: '1px solid #f6f3f0', fontSize: 14 }}>{s.name} <span style={{ color: COLORS.textMuted, fontSize: 12 }}>({(s.items || []).length} поз.)</span></div>)}</div>
        </div>
      </div>
    </div>
  )
}
