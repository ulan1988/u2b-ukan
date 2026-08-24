'use client'
// Смена мастера (кабинет филиала): сводка за день — доходы по способам, проверка,
// счета, расходы, производство в запас, «Закрыть смену». Ввод расходов/ЗП и инкассация —
// на десктопе (Касса дня). Данные — shift.service.masterShift через /api/branch/shift.
import { useState, useEffect, useCallback } from 'react'
import { shiftSummary, closeShiftDay } from '@/lib/api/orders'

const m = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function ShiftView({ uid }: { uid?: string }) {
  const [date, setDate] = useState(todayStr())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState('')
  const toast = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 2200) }
  const load = useCallback(async () => { setLoading(true); setData(await shiftSummary(date, uid)); setLoading(false) }, [date, uid])
  useEffect(() => { load() }, [load])

  async function close() {
    if (!confirm('Закрыть смену? Расходы будут проведены.')) return
    const r: any = await closeShiftDay(date, uid)
    if (r?.ok !== false) { toast('✓ Смена закрыта'); load() } else toast('⚠ ' + (r?.error || 'Не удалось'))
  }

  const inc = data?.income || { cash: 0, kaspi: 0, qr: 0, debt: 0, total: 0 }
  const chk = data?.check || { ok: true, diff: 0 }
  const accts = data?.accounts || []
  const exp = data?.expenses || { total: 0, salaryTotal: 0, currentTotal: 0, rows: [] }
  const tile = (label: string, val: string, color: string) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: '11px 8px', textAlign: 'center', boxShadow: '0 0 0 1px #e6e2dc' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5f5952', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{val}</div>
    </div>
  )
  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>💵 Смена</div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontFamily: 'inherit' }} />
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка…</div> : <>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#2e8a5e', letterSpacing: '.04em', marginBottom: 8 }}>📥 ДОХОДЫ</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          {tile('Наличка', m(inc.cash), '#2e8a5e')}{tile('Каспи', m(inc.kaspi), '#2a5aaa')}{tile('QR', m(inc.qr), '#2a5aaa')}
          {tile('Долг', m(inc.debt), '#c0532a')}{tile('Продано', m(inc.total), '#26231f')}
          {data?.stock && tile('В запас', m(data.stock.amount) + ' ₸', '#7a3aaa')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: chk.ok ? '#e8f5ee' : '#faeaea', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 14 }}>
          <b style={{ color: chk.ok ? '#2e8a5e' : '#b03020' }}>{chk.ok ? '✅ Сходится' : `❌ Расхождение ${m(chk.diff)}`}</b>
          <span style={{ color: '#837c72', marginLeft: 'auto', fontSize: 12 }}>Нал+Каспи+QR+Долг = Продано</span>
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, color: '#5f5952', letterSpacing: '.04em', marginBottom: 8 }}>💰 СЧЕТА ЗА ДЕНЬ</div>
        <div style={{ background: '#fff', borderRadius: 12, padding: '4px 14px', boxShadow: '0 0 0 1px #e6e2dc', marginBottom: 14 }}>
          {accts.length === 0 ? <div style={{ padding: '10px 0', color: '#5f5952', fontSize: 14 }}>Нет счетов</div>
            : accts.map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f1efec', fontSize: 14 }}>
                <span>{a.name}</span><b style={{ color: a.net < 0 ? '#c0532a' : '#26231f' }}>{m(a.net)} ₸</b>
              </div>
            ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#c0532a', letterSpacing: '.04em' }}>📤 РАСХОДЫ</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#837c72' }}>ЗП {m(exp.salaryTotal)} · текущие {m(exp.currentTotal)} · итого <b style={{ color: '#c0532a' }}>{m(exp.total)}</b></span>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: '4px 14px', boxShadow: '0 0 0 1px #e6e2dc', marginBottom: 8 }}>
          {(exp.rows || []).length === 0 ? <div style={{ padding: '10px 0', color: '#5f5952', fontSize: 14 }}>Расходов нет</div>
            : exp.rows.map((r: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1efec', fontSize: 13.5 }}>
                <span>{r.article === 'ЗП' ? '👤 ЗП' : '🧾 ' + r.article}{r.who ? ` · ${r.who}` : ''}{r.status !== 'posted' ? ' (черновик)' : ''}</span>
                <b style={{ color: '#c0532a' }}>−{m(-r.amt)}</b>
              </div>
            ))}
        </div>
        <div style={{ fontSize: 12, color: '#9a938a', marginBottom: 14 }}>Ввод расходов, ЗП и инкассация — в «Касса дня» на компьютере.</div>

        <button onClick={close} disabled={!data?.hasDraft} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: data?.hasDraft ? '#d4613a' : '#e6e2dc', color: '#fff', cursor: data?.hasDraft ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>{data?.hasDraft ? '🔒 Закрыть смену' : '✓ Расходы проведены'}</button>
      </>}
    </div>
  )
}
