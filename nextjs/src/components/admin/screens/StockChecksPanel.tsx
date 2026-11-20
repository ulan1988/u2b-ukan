'use client'
// РЕВИЗИИ ЛОГИСТА в админском «Складе» (правило владельца 20.11.2026).
// Логист пересчитал Центр-Склад за КОНКРЕТНЫЙ ДЕНЬ и отправил факт — здесь админ читает
// документ: слева склад (учёт на эту дату), справа ревизия (факт), третья колонка — разница.
// Склад ревизия не трогает: это сверка, по которой ищут, где потерялся товар.
import { useCallback, useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { stockChecks, stockCheck, stockCheckAccept, stockCheckDelete } from '@/lib/api/refs'
import { matchWords } from '@/lib/search'

const n2 = (v: any) => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString('ru-RU')
const dmy = (d: string) => String(d || '').slice(0, 10).split('-').reverse().join('.')

export default function StockChecksPanel({ orgId }: { orgId: string }) {
  const [list, setList] = useState<any[]>([])
  const [open, setOpen] = useState<string>('')
  const [doc, setDoc] = useState<any>(null)
  const [onlyDiff, setOnlyDiff] = useState(true)
  const [find, setFind] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => { setLoading(true); setList(await stockChecks(orgId) as any); setLoading(false) }, [orgId])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!open) { setDoc(null); return } (async () => setDoc(await stockCheck(open, orgId)))() }, [open, orgId])

  const lines = (doc?.lines || []).filter((l: any) =>
    (!onlyDiff || (l.diff != null && l.diff !== 0)) && (!find.trim() || matchWords(find, l.name)))

  const card: React.CSSProperties = { background: '#fff', border: '1.5px solid #e6e2dc', borderRadius: 12, padding: 14 }
  const th: React.CSSProperties = { textAlign: 'right', fontSize: 11.5, color: '#837c72', fontWeight: 700, padding: '6px 10px', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '7px 10px', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }

  return (
    <div className="anim-fade">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>📋 Ревизии логиста</div>
        <div style={{ fontSize: 13, color: '#5f5952' }}>пересчёт за день · склад не меняется, это сверка</div>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit' }}>⟳ Обновить</button>
      </div>

      {loading ? <div style={{ color: '#5f5952' }}>Загрузка…</div> : list.length === 0 ? (
        <div style={{ ...card, color: '#5f5952' }}>Ревизий пока нет. Логист делает её в своём кабинете: «📦 Остаток» → «Сделать ревизию».</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(c => {
            const isOpen = open === c.id
            return (
              <div key={c.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div onClick={() => setOpen(isOpen ? '' : c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{dmy(c.date)}</span>
                  <span style={{ fontSize: 13, color: '#5f5952' }}>считал {c.author}</span>
                  <span style={{ fontSize: 12.5, color: '#5f5952' }}>{c.lines} поз.</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: c.diffs ? COLORS.primaryDark : '#2e8a5e' }}>
                    {c.diffs ? `расхождений ${c.diffs}` : 'всё сошлось'}
                  </span>
                  {c.status === 'accepted' && <span style={{ fontSize: 11.5, fontWeight: 700, background: '#e8f5ee', color: '#2e8a5e', borderRadius: 20, padding: '2px 9px' }}>разобрано</span>}
                  <span style={{ marginLeft: 'auto', color: '#837c72', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #f1efec', padding: '10px 14px 14px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                      <input value={find} onChange={e => setFind(e.target.value)} placeholder="поиск по товару"
                        style={{ flex: '1 1 200px', minWidth: 140, padding: '7px 11px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 13.5, fontFamily: 'inherit' }} />
                      <button onClick={() => setOnlyDiff(!onlyDiff)}
                        style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid ' + (onlyDiff ? COLORS.primary : '#e6e2dc'), background: onlyDiff ? '#fdeee7' : '#fff', color: onlyDiff ? COLORS.primaryDark : '#5f5952', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                        {onlyDiff ? 'только расхождения' : 'все позиции'}
                      </button>
                      <button onClick={async () => { await stockCheckAccept(c.id, orgId); load() }}
                        style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: c.status === 'accepted' ? '#f1efec' : '#2e8a5e', color: c.status === 'accepted' ? '#5f5952' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                        {c.status === 'accepted' ? '↩ Вернуть в работу' : '✓ Разобрано'}
                      </button>
                      <button onClick={async () => { if (confirm('Удалить ревизию за ' + dmy(c.date) + '? Склад это не меняет.')) { await stockCheckDelete(c.id, orgId); setOpen(''); load() } }}
                        style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', color: '#b03020', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>🗑 Удалить</button>
                    </div>

                    {!doc ? <div style={{ color: '#5f5952' }}>Открываю…</div> : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                          <thead>
                            <tr style={{ borderBottom: '1.5px solid #e6e2dc' }}>
                              <th style={{ ...th, textAlign: 'left' }}>Товар</th>
                              <th style={th}>Склад на {dmy(c.date)}</th>
                              <th style={th}>Ревизия</th>
                              <th style={th}>Разница</th>
                              <th style={{ ...th, width: 40 }}>ед.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: '#5f5952', fontSize: 13.5 }}>
                              {onlyDiff ? 'Расхождений нет — всё сошлось.' : 'Ничего не найдено.'}</td></tr>}
                            {lines.map((l: any, i: number) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f4f1ed', background: l.diff ? '#fdf3f1' : undefined }}>
                                <td style={{ ...td, textAlign: 'left', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</td>
                                <td style={td}>{n2(l.book)}</td>
                                <td style={{ ...td, fontWeight: 700 }}>{l.fact == null ? <span style={{ color: '#b8b1a6' }}>не считал</span> : n2(l.fact)}</td>
                                <td style={{ ...td, fontWeight: 800, color: l.diff == null ? '#b8b1a6' : l.diff > 0 ? '#2e8a5e' : l.diff < 0 ? COLORS.primaryDark : '#5f5952' }}>
                                  {l.diff == null ? '—' : l.diff === 0 ? '0' : (l.diff > 0 ? '+' : '') + n2(l.diff)}
                                </td>
                                <td style={{ ...td, color: '#837c72', fontSize: 12 }}>{l.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
