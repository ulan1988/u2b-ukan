'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { listUsers, createUser, editUser, deleteUser, deleteCabinet } from '@/lib/api/auth'
import { fetchRefs, settings as fetchSettings, categoryRules as fetchRules, saveCategoryRule, setDefaultLogist, setDefaultContragent, createSpecProject, listProjectsByClient, listContragents, addContragent, editContragent, listUnits, saveUnits } from '@/lib/api/refs'
import ContragentPicker from '@/components/ContragentPicker'
import { finFavList, finFavSave } from '@/lib/api/finmoney'
import { CATALOG_CATEGORIES } from '@/lib/nomCatalog'

const STATI_TYPES: [string, string][] = [['in', '↑ Поступление'], ['out', '↓ Платёж'], ['mv', '⇄ Перемещение'], ['service', '• Служебное']]
const STATI_ACTS: { key: string; title: string; badge: string; folders: boolean }[] = [
  { key: 'operating', title: 'Операционная деятельность', badge: 'О', folders: true },
  { key: 'financial', title: 'Финансовая деятельность', badge: 'Ф', folders: true },
  { key: 'investing', title: 'Инвестиционная деятельность', badge: 'И', folders: true },
  { key: 'transfer', title: 'Перемещения', badge: '⇄', folders: false },
  { key: 'service', title: 'Служебные', badge: '•', folders: false },
]
const statiIcon = (t: string) => t === 'in' ? { i: '↑', c: '#0f7b3d' } : t === 'out' ? { i: '↓', c: '#b3261e' } : t === 'both' ? { i: '↕', c: '#8a6d00' } : t === 'mv' ? { i: '⇄', c: '#1a56b0' } : { i: '•', c: '#6b7686' }

const ROLES = [
  { v: 'logist', l: 'Логист' }, { v: 'branch', l: 'Филиал' }, { v: 'client', l: 'Клиент' },
  { v: 'supplier_client', l: 'Поставщик-клиент' }, { v: 'warehouse_manager', l: 'Кладовщик' },
  { v: 'bookkeeper', l: 'Бухгалтер' }, { v: 'admin', l: 'Администратор' },
  { v: 'order_desk', l: 'Заказ-стол (внешний кабинет)' },
]
const roleLabel = (v: string) => ROLES.find(r => r.v === v)?.l || v
const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none', width: '100%' }

export default function SettingsScreen({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<'users' | 'clients' | 'contragents' | 'autofill' | 'projects' | 'stati' | 'units'>('users')
  const [users, setUsers] = useState<any[]>([])
  const [orgs, setOrgs] = useState<{ id: string; name: string; kind?: string }[]>([])
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'logist', orgId })
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<any>(null)
  const [copied, setCopied] = useState('')
  const [allCags, setAllCags] = useState<any[]>([])
  const [cab, setCab] = useState<null | { cagId: string; login: string; password: string; role: string }>(null)
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const accessUrl = (u: any) => u.role === 'branch' ? `${base}/branch/${u.slug}` : (u.role === 'client' || u.role === 'supplier_client') ? `${base}/client/${u.slug}` : u.role === 'logist' ? `${base}/rsp/${u.slug}` : u.role === 'warehouse_manager' ? `${base}/warehouse/${u.slug}` : ''

  const load = () => listUsers().then(setUsers)
  const CLIENT_ROLES = ['client', 'supplier_client']   // кабинеты клиентов (вынесены в отдельную вкладку)
  const shownUsers = tab === 'clients' ? users.filter(u => CLIENT_ROLES.includes(u.role)) : users.filter(u => !CLIENT_ROLES.includes(u.role))
  async function setPriceType(u: any, priceType: string) { await editUser(u.id, { priceType }); load(); setMsg('✓ Тип цены обновлён') }
  async function saveEdit() { if (!editing) return; const r = await editUser(editing.id, editing); if (r.ok) { setEditing(null); load(); setMsg('✓ Сохранено') } }
  async function removeUser(u: any) { if (!confirm(`Отключить пользователя «${u.name}»?`)) return; await deleteUser(u.id); load(); setMsg('✓ Отключён') }
  async function activateUser(u: any) { await editUser(u.id, { active: true }); load(); setMsg(`✓ ${u.name} включён`) }
  function copy(url: string, key: string) { navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(''), 2000) }
  useEffect(() => {
    load()
    fetchRefs().then((r: any) => { setOrgs(r.organizations || []); setAllCags((r.contragents || []).filter((c: any) => !c.orgId || c.orgId === orgId)) })
  }, [orgId]) // eslint-disable-line

  const orgName = (id: string) => orgs.find(o => o.id === id)?.name || '—'
  const cagName = (id: string) => allCags.find(c => c.id === id)?.name || ''
  const reset = () => setF({ name: '', email: '', password: '', role: 'logist', orgId })

  // Создать кабинет для контрагента (точная связка user.contragentId).
  async function createCabinet() {
    if (!cab) return
    const c = allCags.find(x => x.id === cab.cagId)
    if (!c) { setMsg('Выберите контрагента'); return }
    if (!cab.login.trim() || cab.password.length < 4) { setMsg('Логин и пароль (мин. 4)'); return }
    const r: any = await createUser({ orgId, name: c.name, email: cab.login.trim(), password: cab.password, role: cab.role, contragentId: cab.cagId })
    if (r.ok !== false && (r.id || r.name)) { setCab(null); setMsg(`✅ Кабинет для «${c.name}» создан`); load() }
    else setMsg('⚠ ' + (r.error || 'Ошибка'))
  }
  async function removeCabinet(u: any) {
    if (!confirm(`Удалить кабинет «${u.name}»? Аккаунт будет стёрт, заказы сохранятся (связь через контрагента).`)) return
    await deleteCabinet(u.id); load(); setMsg('✓ Кабинет удалён')
  }

  async function create() {
    setMsg('')
    const r = await createUser(f)
    if (!r.ok) { setMsg('⚠ ' + (r.error || 'Ошибка')); return }
    setMsg('✅ Создан'); reset(); load()
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 14 }}>Настройки</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([['users', 'Пользователи'], ['clients', '👤 Кабинеты клиентов'], ['contragents', 'Контрагенты'], ['units', 'Ед. изм.'], ['stati', 'Статьи'], ['autofill', 'Автоподстановка'], ['projects', 'Проекты']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : COLORS.textMuted, boxShadow: tab === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
      </div>

      {tab === 'stati' ? <StatiPanel orgId={orgId} /> : tab === 'units' ? <UnitsPanel /> : tab === 'autofill' ? <AutofillPanel orgId={orgId} /> : tab === 'projects' ? <ProjectsPanel orgId={orgId} /> : tab === 'contragents' ? <ContragentsPanel orgId={orgId} /> : (
      <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{tab === 'clients' ? '👤 Кабинеты клиентов' : 'Пользователи'}</div>
        <button onClick={() => setCab({ cagId: '', login: '', password: '', role: 'client' })} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7a3aaa', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>🔗 Создать кабинет (из контрагента)</button>
      </div>

      {tab === 'clients'
        ? <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>Кабинеты клиентов создаются кнопкой «🔗 Создать кабинет (из контрагента)» — привязка к контрагенту, доступ по ссылке /client/…</div>
        : <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 0 0 1.5px #e6e2dc', marginBottom: 20, maxWidth: 720 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 12 }}>НОВЫЙ ПОЛЬЗОВАТЕЛЬ (сотрудник / логист / филиал)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
          <input style={inp} placeholder="Имя" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input style={inp} placeholder="Логин" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
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
      </div>}

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#5f5952', borderBottom: '1px solid #f1efec' }}>{tab === 'clients' ? 'КЛИЕНТЫ' : 'ПОЛЬЗОВАТЕЛИ'} ({shownUsers.length})</div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['ИМЯ', 'РОЛЬ', 'ОРГАНИЗАЦИЯ', 'ДОСТУП', 'СТАТУС', 'ТИП ЦЕНЫ', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 14px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {shownUsers.map(u => {
              const url = accessUrl(u)
              return (
                <tr key={u.id} style={{ borderTop: '1px solid #f1efec' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name}{u.contragentId && <div style={{ fontSize: 11, color: '#7a3aaa', fontWeight: 600, marginTop: 2 }}>🔗 {cagName(u.contragentId) || 'контрагент'}</div>}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.textMuted }}>{roleLabel(u.role)}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.textMuted }}>{orgName(u.orgId)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {url && <><a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: COLORS.primary, textDecoration: 'none', fontWeight: 600 }}>Открыть</a><button onClick={() => copy(url, u.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: 6, fontSize: 13 }} title="Скопировать ссылку">{copied === u.id ? '✓' : '📋'}</button></>}
                    {(u.phone || u.email) && <span style={{ fontSize: 13, color: '#837c72', marginLeft: 8 }}>{u.phone || u.email}</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: u.active ? '#e8f5ee' : '#faeaea', color: u.active ? '#2e8a5e' : '#b03020' }}>{u.active ? 'Активен' : 'Отключён'}</span></td>
                  <td style={{ padding: '10px 14px' }}>
                    {['client', 'supplier_client', 'branch'].includes(u.role)
                      ? <select value={u.priceType || 'retail'} onChange={e => setPriceType(u, e.target.value)} style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #e6e2dc', fontFamily: 'inherit', background: '#fff' }}><option value="retail">Розничная</option><option value="opt">Оптовая</option><option value="spec">Спец</option></select>
                      : <span style={{ fontSize: 13, color: '#837c72' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditing({ ...u })} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>Изменить</button>
                      {u.active
                        ? <button onClick={() => removeUser(u)} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #f3d5c6', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#b03020' }}>Отключить</button>
                        : <button onClick={() => activateUser(u)} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#2e8a5e', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>Включить</button>}
                      {u.contragentId && <button onClick={() => removeCabinet(u)} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #f0c9c9', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#b03020', fontWeight: 600 }}>Удалить кабинет</button>}
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
                <div><label style={LBL}>ЛОГИН</label><input style={inp} value={editing.email || ''} onChange={e => setEditing((p: any) => ({ ...p, email: e.target.value }))} /></div>
                <div><label style={LBL}>ТЕЛЕФОН</label><input style={inp} value={editing.phone || ''} onChange={e => setEditing((p: any) => ({ ...p, phone: e.target.value }))} /></div>
              </div>
              <div><label style={LBL}>SLUG (адрес кабинета)</label><input style={inp} value={editing.slug || ''} onChange={e => setEditing((p: any) => ({ ...p, slug: e.target.value }))} /></div>
              <div><label style={LBL}>НОВЫЙ ПАРОЛЬ</label><input style={inp} type="password" autoComplete="new-password" placeholder="оставьте пустым — не менять (мин. 4)" value={editing.password || ''} onChange={e => setEditing((p: any) => ({ ...p, password: e.target.value }))} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!editing.active} onChange={e => setEditing((p: any) => ({ ...p, active: e.target.checked }))} /><span style={{ fontSize: 14 }}>Активен</span></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
                <button onClick={saveEdit} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Сохранить →</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cab && (
        <div onClick={() => setCab(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="anim-pop" style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>🔗 Создать кабинет</div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 18 }}>Выбери контрагента — кабинет будет жёстко к нему привязан (заказы пойдут на этого контрагента).</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={LBL}>КОНТРАГЕНТ</label><ContragentPicker contragents={allCags} value={cab.cagId} onPick={c => setCab({ ...cab, cagId: c.id, login: cab.login })} placeholder="— выберите контрагента —" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LBL}>ЛОГИН</label><input style={inp} value={cab.login} onChange={e => setCab({ ...cab, login: e.target.value })} placeholder="логин для входа" /></div>
                <div><label style={LBL}>ПАРОЛЬ</label><input style={inp} type="text" value={cab.password} onChange={e => setCab({ ...cab, password: e.target.value })} placeholder="мин. 4" /></div>
              </div>
              <div><label style={LBL}>ТИП КАБИНЕТА</label><select style={inp} value={cab.role} onChange={e => setCab({ ...cab, role: e.target.value })}><option value="client">Клиент</option><option value="supplier_client">Поставщик-клиент</option><option value="branch">Филиал</option></select></div>
              {msg && <div style={{ fontSize: 13, color: COLORS.textMuted }}>{msg}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setCab(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
                <button onClick={createCabinet} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#7a3aaa', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Создать кабинет →</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }

// ─── Контрагенты: единый каталог клиентов/поставщиков (клиент может быть и поставщиком) ─
const KIND_LBL: Record<string, string> = { client: 'Клиент', supplier: 'Поставщик', both: 'Клиент+Поставщик' }
function ContragentsPanel({ orgId }: { orgId: string }) {
  const [list, setList] = useState<any[]>([])
  const [showArch, setShowArch] = useState(false)
  const [msg, setMsg] = useState('')
  const [f, setF] = useState({ name: '', kind: 'client', priceType: 'retail', phone: '', bin: '', openingBalance: '' })

  const load = () => listContragents(true).then((d: any[]) => setList((d || []).filter((c: any) => !c.orgId || c.orgId === orgId)))
  useEffect(() => { load() }, [orgId]) // eslint-disable-line

  async function create() {
    if (!f.name.trim()) { setMsg('Укажите название'); return }
    const r: any = await addContragent({ orgId, ...f, openingBalance: Number(f.openingBalance) || 0 })
    if (r.id || r.ok !== false) { setF({ name: '', kind: 'client', priceType: 'retail', phone: '', bin: '', openingBalance: '' }); setMsg('✅ Добавлен'); load() }
    else setMsg('⚠ ' + (r.error || 'Ошибка'))
  }
  async function setArchived(c: any, archived: boolean) { await editContragent(c.id, { archived }); load(); setMsg(archived ? '✓ В архиве' : '✓ Восстановлен') }
  async function setFav(c: any) { await editContragent(c.id, { favorite: !c.favorite }); load() }
  async function rename(c: any, name: string) { if (name && name !== c.name) { await editContragent(c.id, { name }); load() } }
  async function setKind(c: any, kind: string) { await editContragent(c.id, { kind }); load() }
  async function setPT(c: any, priceType: string) { await editContragent(c.id, { priceType }); load() }
  async function setBin(c: any, bin: string) { if (bin !== (c.bin || '')) { await editContragent(c.id, { bin }); load() } }
  async function setOpening(c: any, v: string) { const n = Number(v) || 0; if (n !== Number(c.openingBalance || 0)) { await editContragent(c.id, { openingBalance: n }); load(); setMsg('✓ Нач. остаток сохранён') } }

  const visible = list.filter(c => showArch || !c.archived)
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Контрагенты (клиенты и поставщики)</div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>Единый каталог: один контрагент может быть и клиентом, и поставщиком. Отсюда берётся список в поиске «Кому»/поставщик. {msg}</div>

      {/* Добавить */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: 14, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}><label style={LBL}>НАЗВАНИЕ</label><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Имя клиента/поставщика" /></div>
        <div><label style={LBL}>ТИП</label><select style={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND_LBL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label style={LBL}>ЦЕНА</label><select style={inp} value={f.priceType} onChange={e => setF({ ...f, priceType: e.target.value })}><option value="retail">Розница</option><option value="opt">Опт</option><option value="spec">Спец</option></select></div>
        <div><label style={LBL}>ТЕЛЕФОН</label><input style={inp} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="—" /></div>
        <div><label style={LBL}>БИН/ИИН</label><input style={{ ...inp, width: 120 }} value={f.bin} onChange={e => setF({ ...f, bin: e.target.value })} placeholder="—" /></div>
        <div><label style={LBL} title="+ нам должны, − мы должны">НАЧ. ОСТАТОК</label><input style={{ ...inp, width: 120, textAlign: 'right' }} type="number" value={f.openingBalance} onChange={e => setF({ ...f, openingBalance: e.target.value })} placeholder="0" /></div>
        <button onClick={create} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>+ Добавить</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#5f5952' }}>ВСЕГО: {visible.length}</span>
        <label style={{ fontSize: 12, color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={showArch} onChange={e => setShowArch(e.target.checked)} /> показать архив</label>
      </div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['⭐', 'Название', 'Тип', 'Цена', 'БИН/ИИН', 'Нач. остаток', 'Телефон', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '9px 14px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {visible.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid #f1efec', opacity: c.archived ? 0.5 : 1 }}>
                <td style={{ padding: '7px 10px', textAlign: 'center' }}><button onClick={() => setFav(c)} title={c.favorite ? 'Убрать из избранного' : 'В избранное'} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, filter: c.favorite ? 'none' : 'grayscale(1) opacity(0.35)' }}>⭐</button></td>
                <td style={{ padding: '7px 14px' }}><input defaultValue={c.name} onBlur={e => rename(c, e.target.value.trim())} style={{ ...inp, padding: '6px 8px', fontWeight: 600 }} /></td>
                <td style={{ padding: '7px 14px' }}><select value={c.kind} onChange={e => setKind(c, e.target.value)} style={{ ...inp, padding: '6px 8px', width: 'auto' }}>{Object.entries(KIND_LBL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td style={{ padding: '7px 14px' }}><select value={c.priceType || 'retail'} onChange={e => setPT(c, e.target.value)} style={{ ...inp, padding: '6px 8px', width: 'auto' }}><option value="retail">Розница</option><option value="opt">Опт</option><option value="spec">Спец</option></select></td>
                <td style={{ padding: '7px 14px' }}><input defaultValue={c.bin || ''} onBlur={e => setBin(c, e.target.value.trim())} style={{ ...inp, padding: '6px 8px', width: 110 }} placeholder="—" /></td>
                <td style={{ padding: '7px 14px' }}><input defaultValue={Number(c.openingBalance || 0) || ''} onBlur={e => setOpening(c, e.target.value)} type="number" style={{ ...inp, padding: '6px 8px', width: 110, textAlign: 'right', color: Number(c.openingBalance || 0) > 0 ? '#2e8a5e' : Number(c.openingBalance || 0) < 0 ? '#b03020' : COLORS.text }} placeholder="0" /></td>
                <td style={{ padding: '7px 14px', color: COLORS.textMuted }}>{c.phone || '—'}</td>
                <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                  {c.archived
                    ? <button onClick={() => setArchived(c, false)} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 12 }}>Восстановить</button>
                    : <button onClick={() => setArchived(c, true)} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #faeaea', background: '#fff', color: '#b03020', cursor: 'pointer', fontSize: 12 }}>В архив</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Автоподстановка: поставщик + логист по 4 категориям каталога ──────────────
function AutofillPanel({ orgId }: { orgId: string }) {
  const [rules, setRules] = useState<Record<string, any>>({})
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [logists, setLogists] = useState<any[]>([])
  const [allCags, setAllCags] = useState<any[]>([])
  const [defLogist, setDefLogist] = useState('')
  const [defCag, setDefCag] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const [rl, st, us, refs] = await Promise.all([fetchRules(orgId), fetchSettings(orgId), listUsers(), fetchRefs()])
    const byCat: Record<string, any> = {}; for (const r of rl) byCat[r.category] = r
    setRules(byCat)
    setSuppliers((st as any).suppliers || [])
    setDefLogist((st as any).defaultLogistId || '')
    setDefCag((st as any).defaultContragentId || '')
    setLogists(us.filter((u: any) => u.role === 'logist' && u.orgId === orgId))
    setAllCags(((refs as any).contragents || []).filter((c: any) => !c.orgId || c.orgId === orgId))
  }

  async function saveDefaultLogist(id: string) {
    setDefLogist(id); setMsg('')
    const r = await setDefaultLogist(orgId, id)
    if (r.ok) setMsg('✅ Логист по умолчанию сохранён')
  }

  async function saveDefaultCag(id: string) {
    setDefCag(id); setMsg('')
    const r = await setDefaultContragent(orgId, id)
    if (r.ok) setMsg('✅ Контрагент по умолчанию сохранён')
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

      {/* Логист по умолчанию — для авто-связанных продаж при оформлении закупа. */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Логист по умолчанию</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>Назначается связанным продажам, когда оформлен закуп (готовый вид в Приёмке).</div>
        </div>
        <select style={{ ...inp, minWidth: 220, width: 'auto', marginLeft: 'auto' }} value={defLogist} onChange={e => saveDefaultLogist(e.target.value)}>
          <option value="">— не выбран —</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {/* Контрагент по умолчанию — первым в списке выбора «Кому»/поставщик. */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Контрагент по умолчанию</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>Показывается первым (★) в списке выбора контрагента; остальные — через поиск.</div>
        </div>
        <select style={{ ...inp, minWidth: 220, width: 'auto', marginLeft: 'auto' }} value={defCag} onChange={e => saveDefaultCag(e.target.value)}>
          <option value="">— не выбран —</option>{allCags.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
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
  const [pClient, setPClient] = useState('')                       // контрагент, которому создаём проект
  const [cags, setCags] = useState<any[]>([])
  const [clientProjects, setClientProjects] = useState<any[]>([])  // проекты выбранного контрагента
  const [spName, setSpName] = useState('')
  const [spItems, setSpItems] = useState<any[]>([{ name: '', qty: '1', unit: 'шт' }])
  const [msg, setMsg] = useState('')

  const load = () => fetchSettings(orgId).then(setData)
  useEffect(() => { load(); fetchRefs().then((r: any) => setCags((r.contragents || []).filter((c: any) => !c.archived))) }, [orgId])
  const loadClientProjects = (cid: string) => { if (cid) listProjectsByClient(cid).then(setClientProjects); else setClientProjects([]) }
  useEffect(() => { loadClientProjects(pClient) }, [pClient])

  async function addProject() {
    if (!pName.trim() || !pClient) { setMsg('Выберите контрагента и введите имя проекта'); return }
    // Проект контрагента = spec_project с заказчиком (единый источник для тега карточки и акта сверки).
    const r = await createSpecProject({ name: pName, clientId: pClient, items: [] }); if (r.ok || (r as any).id) { setPName(''); setMsg('✅ Проект создан'); loadClientProjects(pClient) }
  }
  async function addSpec() {
    if (!spName.trim()) return
    const items = spItems.filter(i => i.name.trim()).map(i => ({ name: i.name, qty: Number(i.qty) || 0, unit: i.unit }))
    const r = await createSpecProject({ name: spName, items }); if (r.ok) { setSpName(''); setSpItems([{ name: '', qty: '1', unit: 'шт' }]); setMsg('✅ Спецпроект создан'); load() }
  }
  const setItem = (i: number, patch: any) => setSpItems(s => s.map((x, j) => j === i ? { ...x, ...patch } : x))

  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>Проекты контрагента — по ним идёт акт сверки и тегируются карточки. Производственные проекты — call-off производителя. {msg}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 10 }}>📁 ПРОЕКТЫ КОНТРАГЕНТА</div>
          <div style={{ marginBottom: 10 }}><ContragentPicker contragents={cags} value={pClient} onPick={(c: any) => setPClient(c.id)} placeholder="— сначала выберите контрагента —" /></div>
          {!pClient ? <div style={{ fontSize: 13, color: COLORS.textMuted, padding: '8px 0' }}>Выберите контрагента — затем добавляйте ему проекты.</div>
            : <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input style={{ ...inp, flex: 1 }} placeholder="Название проекта (напр. Школа Каскасу)" value={pName} onChange={e => setPName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addProject() }} />
                <button onClick={addProject} disabled={!pName.trim()} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: pName.trim() ? COLORS.primary : COLORS.border, color: '#fff', fontWeight: 700, fontSize: 13, cursor: pName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>＋ Проект</button>
              </div>
              {clientProjects.length === 0 ? <div style={{ fontSize: 13, color: COLORS.textMuted }}>У контрагента проектов нет</div>
                : clientProjects.map((p: any) => <div key={p.id} style={{ padding: '7px 0', borderTop: '1px solid #f6f3f0', fontSize: 14 }}>📁 {p.name}</div>)}
            </>}
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 10 }}>🏭 ПРОИЗВОДСТВЕННЫЕ ПРОЕКТЫ ({(data.specProjects || []).length})</div>
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

// Статьи ДДС — справочник строк для листа «Деньги» (fin_favorites).
function StatiPanel({ orgId }: { orgId: string }) {
  const [list, setList] = useState<any[]>([])
  const [cags, setCags] = useState<any[]>([])
  const [accs, setAccs] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { (async () => {
    const [r, c, refs] = await Promise.all([finFavList(), listContragents(true), fetchRefs()])
    setList((((r as any)?.data) || []).map((f: any) => ({ code: f.code || '', label: f.label, type: f.type, activity: f.activity || 'operating', contragentId: f.contragentId || null, defaultAccountId: f.defaultAccountId || '' })))
    setCags(c as any[]); setAccs(((refs as any)?.cashAccounts || []).filter((a: any) => !a.archived)); setLoading(false)
  })() }, [])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const upd = (i: number, patch: any) => setList(l => l.map((x, j) => j === i ? { ...x, ...patch } : x))
  const del = (i: number) => setList(l => l.filter((_, j) => j !== i))
  const add = (activity: string, type: string) => setList(l => [...l, { code: '', label: 'Новая статья', type, activity, contragentId: null, defaultAccountId: '' }])
  async function save() { const r: any = await finFavSave(list); setMsg(r?.ok ? '✓ Сохранено' : '⚠ Ошибка'); setTimeout(() => setMsg(''), 2000) }
  const miniB: React.CSSProperties = { border: '1px solid #e6e2dc', background: '#fff', borderRadius: 6, color: '#6b655b', padding: '2px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
  const cell: React.CSSProperties = { ...inp, padding: '5px 7px', fontSize: 12.5 }
  if (loading) return <div style={{ padding: 30, color: COLORS.textMuted }}>Загрузка…</div>

  // Редактируемая строка-статья (по индексу в list).
  const Row = (i: number, indent: number) => {
    const f = list[i]; const ic = statiIcon(f.type)
    return (
      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', paddingLeft: indent, borderTop: '1px solid #f4f5f7' }}>
        <span style={{ color: ic.c, fontWeight: 800, width: 14, textAlign: 'center' }}>{ic.i}</span>
        <input value={f.code || ''} onChange={e => upd(i, { code: e.target.value })} placeholder="код" style={{ ...cell, width: 66, fontFamily: 'Consolas, monospace' }} />
        <input value={f.label} onChange={e => upd(i, { label: e.target.value })} style={{ ...cell, flex: '1 1 150px', minWidth: 110 }} />
        <select value={f.type} onChange={e => upd(i, { type: e.target.value })} style={{ ...cell, width: 118 }}>{STATI_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <div style={{ width: 160 }}><ContragentPicker contragents={cags} value={f.contragentId} onPick={(c: any) => upd(i, { contragentId: c.id })} placeholder="— контрагент —" /></div>
        <select value={f.defaultAccountId || ''} onChange={e => upd(i, { defaultAccountId: e.target.value || null })} title="Счёт по умолчанию" style={{ ...cell, width: 92 }}><option value="">счёт</option>{accs.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <button onClick={() => del(i)} title="Удалить" style={{ ...miniB, color: '#c1121c' }}>✕</button>
      </div>
    )
  }
  const folderHead = (name: string, onAdd: () => void) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px', paddingLeft: 30, fontWeight: 600, color: '#6b655b', fontSize: 13 }}>
      📁 {name} <button onClick={onAdd} style={{ ...miniB, fontSize: 11 }}>+ статья</button>
    </div>
  )

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1px #e6e2dc', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexWrap: 'wrap', borderBottom: '1px solid #eee' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Статьи ДДС</div>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>{list.length} шт. · Деятельность → Поступления/Платежи → статья</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 13, color: msg[0] === '✓' ? '#2e8a5e' : '#b03020' }}>{msg}</span>}
          <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Сохранить</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}><div style={{ minWidth: 700 }}>
        {STATI_ACTS.map(act => {
          const items = list.map((f, i) => ({ f, i })).filter(x => (x.f.activity || 'operating') === act.key)
          const isCol = collapsed.has(act.key)
          return (
            <div key={act.key}>
              <div onClick={() => setCollapsed(s => { const n = new Set(s); n.has(act.key) ? n.delete(act.key) : n.add(act.key); return n })}
                style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#eef0f3', padding: '9px 12px', cursor: 'pointer', fontWeight: 700, borderTop: '1px solid #d0d5db' }}>
                <span style={{ width: 12 }}>{isCol ? '▸' : '▾'}</span>
                {act.badge && <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#1c2430', color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{act.badge}</span>}
                {act.title}<span style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.textMuted, fontWeight: 400 }}>{items.length}</span>
              </div>
              {!isCol && (act.folders ? <>
                {folderHead('Поступления', () => add(act.key, 'in'))}
                {items.filter(x => x.f.type === 'in').map(x => Row(x.i, 50))}
                {folderHead('Платежи', () => add(act.key, 'out'))}
                {items.filter(x => x.f.type === 'out').map(x => Row(x.i, 50))}
                {items.filter(x => x.f.type === 'mv' || x.f.type === 'service').map(x => Row(x.i, 30))}
              </> : <>
                {items.map(x => Row(x.i, 30))}
                <div style={{ padding: '5px 8px', paddingLeft: 30 }}><button onClick={() => add(act.key, act.key === 'transfer' ? 'mv' : 'service')} style={{ ...miniB, fontSize: 11 }}>+ статья</button></div>
              </>)}
            </div>
          )
        })}
      </div></div>
    </div>
  )
}

// Справочник единиц измерения (для номенклатуры). Одна — по умолчанию.
function UnitsPanel() {
  const [list, setList] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { listUnits().then((r: any) => { setList((r || []).map((x: any) => ({ name: x.name, isDefault: !!x.isDefault }))); setLoading(false) }) }, [])
  const upd = (i: number, patch: any) => setList(l => l.map((x, j) => j === i ? { ...x, ...patch } : x))
  const move = (i: number, d: number) => setList(l => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return n;[n[i], n[j]] = [n[j], n[i]]; return n })
  const setDefault = (i: number) => setList(l => l.map((x, j) => ({ ...x, isDefault: j === i })))
  async function save() { const r: any = await saveUnits(list); setMsg(r?.ok ? '✓ Сохранено' : '⚠ Ошибка'); setTimeout(() => setMsg(''), 2000) }
  const miniB: React.CSSProperties = { border: '1px solid #e6e2dc', background: '#fff', borderRadius: 6, color: '#6b655b', padding: '2px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
  if (loading) return <div style={{ padding: 30, color: COLORS.textMuted }}>Загрузка…</div>
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 0 0 1px #e6e2dc', maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Единицы измерения</div>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>{list.length} шт.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 13, color: msg[0] === '✓' ? '#2e8a5e' : '#b03020' }}>{msg}</span>}
          <button onClick={() => setList(l => [...l, { name: '', isDefault: false }])} style={miniB}>+ Единица</button>
          <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Сохранить</button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginBottom: 12 }}>Список единиц для номенклатуры (шт, м², см…). Отметь одну «по умолчанию» — она будет подставляться новым товарам.</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ color: COLORS.textMuted, fontSize: 11 }}>{['', 'Единица', 'По умолч.', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '6px 8px' }}>{h}</th>)}</tr></thead>
        <tbody>
          {list.map((f, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f1efec' }}>
              <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}><button onClick={() => move(i, -1)} style={miniB}>▲</button> <button onClick={() => move(i, 1)} style={miniB}>▼</button></td>
              <td style={{ padding: '6px 8px' }}><input value={f.name} onChange={e => upd(i, { name: e.target.value })} placeholder="шт" style={{ ...inp, padding: '6px 9px', width: 140 }} /></td>
              <td style={{ padding: '6px 8px' }}><input type="radio" name="defunit" checked={!!f.isDefault} onChange={() => setDefault(i)} style={{ cursor: 'pointer', width: 16, height: 16 }} /></td>
              <td style={{ padding: '6px 8px' }}><button onClick={() => setList(l => l.filter((_, j) => j !== i))} title="Удалить" style={{ ...miniB, color: '#c1121c' }}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
