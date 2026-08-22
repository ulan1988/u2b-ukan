'use client'
// Справочник сотрудников филиала: имя, должность, дневной оклад. Отсюда касса берёт список ЗП.
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { listEmployees, saveEmployee, archiveEmployee } from '@/lib/api/refs'

const m = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU')
const blank = () => ({ name: '', position: '', dailyWage: '' })

export default function EmployeesScreen({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [form, setForm] = useState<any>(blank())
  const [editId, setEditId] = useState<string | null>(null)
  const [flash, setFlash] = useState('')
  const toast = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 2200) }
  const load = useCallback(async () => { setRows(await listEmployees(orgId)) }, [orgId])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.name.trim()) { toast('Укажите имя'); return }
    const r: any = await saveEmployee({ orgId, id: editId || undefined, name: form.name, position: form.position, dailyWage: Number((form.dailyWage || '').replace(',', '.')) || 0 })
    if (r.ok || r.id) { toast(editId ? '✓ Сохранено' : '✓ Сотрудник добавлен'); setForm(blank()); setEditId(null); load() } else toast('⚠ ' + (r.error || 'Не удалось'))
  }
  async function edit(e: any) { setEditId(e.id); setForm({ name: e.name, position: e.position || '', dailyWage: e.dailyWage != null ? String(Number(e.dailyWage)) : '' }) }
  async function remove(id: string) { if (!confirm('Убрать сотрудника из списка?')) return; const r: any = await archiveEmployee(id); if (r.ok) { toast('✓ Убран'); load() } else toast('⚠ Не удалось') }

  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: COLORS.dark, color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>👥 Сотрудники</div>

      {/* Добавить / изменить */}
      <div style={{ background: COLORS.white, borderRadius: 14, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: 16, marginBottom: 16, maxWidth: 640 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textSubtle, letterSpacing: '.04em', marginBottom: 10 }}>{editId ? 'ИЗМЕНИТЬ СОТРУДНИКА' : 'ДОБАВИТЬ СОТРУДНИКА'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="Имя" style={{ ...inp, flex: '2 1 180px' }} />
          <input value={form.position} onChange={e => setForm((f: any) => ({ ...f, position: e.target.value }))} placeholder="Должность (напр. распиловщик)" style={{ ...inp, flex: '2 1 180px' }} />
          <input value={form.dailyWage} inputMode="decimal" onChange={e => setForm((f: any) => ({ ...f, dailyWage: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="Дневной оклад" style={{ ...inp, width: 150, textAlign: 'right', fontWeight: 700 }} />
          <button onClick={save} style={{ border: 'none', background: COLORS.primary, color: '#fff', borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{editId ? 'Сохранить' : '＋ Добавить'}</button>
          {editId && <button onClick={() => { setEditId(null); setForm(blank()) }} style={{ border: `1.5px solid ${COLORS.border}`, background: '#fff', color: COLORS.textMuted, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>Отмена</button>}
        </div>
      </div>

      {/* Список */}
      <div style={{ background: COLORS.white, borderRadius: 14, boxShadow: `0 0 0 1.5px ${COLORS.border}`, overflow: 'hidden', maxWidth: 640 }}>
        {rows.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMuted }}>Сотрудников нет — добавьте выше</div>
          : rows.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? `1px solid ${COLORS.borderLight}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{e.name}</div>
                {e.position && <div style={{ fontSize: 12.5, color: COLORS.textLight }}>{e.position}</div>}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{Number(e.dailyWage) > 0 ? `${m(e.dailyWage)} ₸/день` : '—'}</div>
              <button onClick={() => edit(e)} style={{ border: `1.5px solid ${COLORS.border}`, background: '#fff', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: COLORS.textMuted }}>✎</button>
              <button onClick={() => remove(e.id)} style={{ border: '1.5px solid #e6c9b8', background: '#fff', color: COLORS.primaryDark, borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>🗑</button>
            </div>
          ))}
      </div>
    </div>
  )
}
