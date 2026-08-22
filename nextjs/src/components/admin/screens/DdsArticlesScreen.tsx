'use client'
// Управление статьями движения денежных средств (ДДС): дерево деятельность → группа → статья,
// направление приход/расход/оба. Как в 1С. Используется в кассе и отчёте ДДС.
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { listDdsArticles, saveDdsArticle, archiveDdsArticle } from '@/lib/api/refs'

const ACT: Record<string, string> = { operating: 'Операционная деятельность', transfer: 'Перемещения', financial: 'Финансовая деятельность', investing: 'Инвестиционная деятельность' }
const DIR: Record<string, string> = { in: '↑ приход', out: '↓ расход', both: '↕ оба' }
const dirIcon = (d: string) => d === 'in' ? '↑' : d === 'out' ? '↓' : '↕'
const dirColor = (d: string) => d === 'in' ? '#2e8a5e' : d === 'out' ? '#c0532a' : '#7a3aaa'

export default function DdsArticlesScreen({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [flash, setFlash] = useState('')
  const blank = { id: '', name: '', activity: 'operating', kind: 'article' as 'article' | 'group', direction: 'out', parentId: '' }
  const [f, setF] = useState<any>(blank)
  const toast = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 2200) }
  const load = useCallback(async () => { setRows(await listDdsArticles(orgId)) }, [orgId])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!f.name.trim()) { toast('Укажите название'); return }
    const r: any = await saveDdsArticle({ orgId, id: f.id || undefined, name: f.name, activity: f.activity, isGroup: f.kind === 'group', direction: f.direction, parentId: f.kind === 'group' ? null : (f.parentId || null) })
    if (r.ok || r.id) { toast(f.id ? '✓ Сохранено' : '✓ Добавлено'); setF({ ...blank, activity: f.activity }); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  function edit(a: any) { setF({ id: a.id, name: a.name, activity: a.activity, kind: a.isGroup ? 'group' : 'article', direction: a.direction, parentId: a.parentId || '' }) }
  async function remove(id: string) { if (!confirm('Убрать статью/группу (с вложенными)?')) return; const r: any = await archiveDdsArticle(id); if (r.ok) { toast('✓ Убрано'); load() } else toast('⚠ Не удалось') }

  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }
  const groupsOf = (act: string) => rows.filter(r => r.activity === act && r.isGroup)
  const article = (a: any) => (
    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0 7px 16px', borderBottom: `1px solid ${COLORS.borderLight}` }}>
      <span style={{ color: dirColor(a.direction), fontWeight: 800, width: 16, textAlign: 'center' }}>{dirIcon(a.direction)}</span>
      <span style={{ flex: 1, fontSize: 14 }}>{a.name}</span>
      <button onClick={() => edit(a)} style={{ border: `1.5px solid ${COLORS.border}`, background: '#fff', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: COLORS.textMuted }}>✎</button>
      <button onClick={() => remove(a.id)} style={{ border: '1.5px solid #e6c9b8', background: '#fff', color: COLORS.primaryDark, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>🗑</button>
    </div>
  )

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: COLORS.dark, color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>📊 Статьи движения денежных средств</div>

      {/* Форма создания/правки */}
      <div style={{ background: COLORS.white, borderRadius: 14, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: 16, marginBottom: 16, maxWidth: 760 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textSubtle, letterSpacing: '.04em', marginBottom: 10 }}>{f.id ? 'ИЗМЕНИТЬ' : 'ДОБАВИТЬ'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, background: COLORS.bg, borderRadius: 8, padding: 3 }}>
            {(['article', 'group'] as const).map(k => <button key={k} onClick={() => setF((x: any) => ({ ...x, kind: k }))} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: f.kind === k ? COLORS.primary : 'transparent', color: f.kind === k ? '#fff' : COLORS.textMuted }}>{k === 'article' ? 'Статья' : 'Группа'}</button>)}
          </div>
          <input value={f.name} onChange={e => setF((x: any) => ({ ...x, name: e.target.value }))} placeholder={f.kind === 'group' ? 'Название группы (напр. Платежи)' : 'Название статьи'} style={{ ...inp, flex: '2 1 200px' }} />
          <select value={f.activity} onChange={e => setF((x: any) => ({ ...x, activity: e.target.value }))} style={{ ...inp, flex: '1 1 160px' }}>
            {Object.entries(ACT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {f.kind === 'article' && <>
            <select value={f.direction} onChange={e => setF((x: any) => ({ ...x, direction: e.target.value }))} style={{ ...inp, width: 130 }}>
              {Object.entries(DIR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.parentId} onChange={e => setF((x: any) => ({ ...x, parentId: e.target.value }))} style={{ ...inp, width: 160 }}>
              <option value="">— без группы —</option>
              {groupsOf(f.activity).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </>}
          <button onClick={save} style={{ border: 'none', background: COLORS.primary, color: '#fff', borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{f.id ? 'Сохранить' : '＋ Добавить'}</button>
          {f.id && <button onClick={() => setF(blank)} style={{ border: `1.5px solid ${COLORS.border}`, background: '#fff', color: COLORS.textMuted, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>Отмена</button>}
        </div>
      </div>

      {/* Дерево */}
      <div style={{ maxWidth: 760 }}>
        {Object.keys(ACT).map(act => {
          const inAct = rows.filter(r => r.activity === act)
          if (!inAct.length) return null
          const groups = inAct.filter(r => r.isGroup)
          const direct = inAct.filter(r => !r.isGroup && !r.parentId)
          return (
            <div key={act} style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>⚙️ {ACT[act]}</div>
              {groups.map(g => (
                <div key={g.id} style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>📁 {g.name}</span>
                    <button onClick={() => edit(g)} style={{ marginLeft: 'auto', border: `1.5px solid ${COLORS.border}`, background: '#fff', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: COLORS.textMuted }}>✎</button>
                    <button onClick={() => remove(g.id)} style={{ border: '1.5px solid #e6c9b8', background: '#fff', color: COLORS.primaryDark, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>🗑</button>
                  </div>
                  {inAct.filter(r => r.parentId === g.id).map(article)}
                </div>
              ))}
              {direct.map(article)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
