'use client'
// Склад — портирован из Улкана 1:1 (KPI, остатки с резервом + прогресс, движения
// по вкладкам, ручной приход). API → /api/stock (overview/movements/income).
import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { stockOverview, stockMovements, stockIncome } from '@/lib/api/refs'

interface StockItem { id: string; name: string; unit: string; qty: number; reserved: number; cat?: string }
interface Movement { id: string; type: 'income' | 'reserve' | 'expense'; name: string; qty: number; unit: string; cardId?: string; createdAt: string }
type MovTab = 'all' | 'income' | 'reserve' | 'expense'

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div style={{ height: 4, background: '#f1efec', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: 'width .4s' }} /></div>
}
function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string; icon: string }> = {
    income: { label: 'Приход', bg: '#e8f5ee', color: '#2e8a5e', icon: '📥' },
    reserve: { label: 'Резерв', bg: '#eef2ff', color: '#4a5aaa', icon: '🔒' },
    expense: { label: 'Расход', bg: '#faeaea', color: '#b03020', icon: '📤' },
  }
  const s = map[type] || { label: type, bg: '#f1efec', color: '#5f5952', icon: '•' }
  return <span style={{ fontSize: 12, fontWeight: 600, background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>
}
const fmtQty = (type: string, qty: number) => (type === 'income' ? `+${qty}` : `−${qty}`)
function fmtTime(iso: string): string {
  const d = new Date(iso); const diff = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diff < 1) return 'только что'; if (diff < 60) return `${diff} мин`; if (diff < 1440) return `${Math.floor(diff / 60)} ч`
  if (diff < 2880) return 'вчера'; return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function IncomeModal({ items, onClose, onSubmit }: { items: StockItem[]; onClose: () => void; onSubmit: (name: string, qty: number, unit: string) => Promise<void> }) {
  const [selId, setSelId] = useState(''); const [customName, setCustomName] = useState(''); const [qty, setQty] = useState(''); const [unit, setUnit] = useState('шт'); const [loading, setLoading] = useState(false)
  const selItem = items.find(i => i.id === selId)
  useEffect(() => { if (selItem) setUnit(selItem.unit) }, [selItem])
  async function handle() { const name = selItem?.name || customName; if (!name || !qty) return; setLoading(true); await onSubmit(name, Number(qty), unit); setLoading(false); onClose() }
  const INP: React.CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>📥 Приход на склад</div>
        <div style={{ fontSize: 14, color: '#5f5952', marginBottom: 20 }}>Центр-Склад · ручной приход</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }}>НОМЕНКЛАТУРА</label><select style={INP} value={selId} onChange={e => { setSelId(e.target.value); setCustomName('') }}><option value="">— выбрать из номенклатуры —</option>{items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></div>
          {!selId && <div><label style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }}>ИЛИ ВВЕДИТЕ ВРУЧНУЮ</label><input style={INP} value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Название товара..." /></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }}>КОЛИЧЕСТВО *</label><input style={INP} type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" min="0.01" step="0.01" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }}>ЕД.</label><input style={INP} value={unit} onChange={e => setUnit(e.target.value)} placeholder="шт" /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
          <button onClick={handle} disabled={loading || (!selId && !customName) || !qty} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: loading ? .6 : 1 }}>{loading ? 'Добавляю...' : '+ Добавить на склад'}</button>
        </div>
      </div>
    </div>
  )
}

export default function WarehouseScreen({ orgId, onOpenCard }: { orgId: string; onOpenCard?: (cardId: string) => void }) {
  const [stock, setStock] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [movTab, setMovTab] = useState<MovTab>('all')
  const [search, setSearch] = useState('')
  const [showIncome, setShowIncome] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, m] = await Promise.all([stockOverview(orgId), stockMovements(orgId)])
      setStock(s as any); setMovements(m as any)
    } catch {} finally { setLoading(false) }
  }, [orgId])
  useEffect(() => { load() }, [load])

  function showMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2300) }
  async function handleIncome(name: string, qty: number, unit: string) {
    const r = await stockIncome({ name, qty, unit })
    if (r.ok) { showMsg(`✓ Приход: ${name} ${qty} ${unit}`); load() } else showMsg('Ошибка')
  }

  const filteredStock = stock.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
  const filteredMovements = movements.filter(m => movTab === 'all' || m.type === movTab)
  const totalItems = stock.length
  const reservedCount = stock.filter(s => s.reserved > 0).length
  const incomeCount = movements.filter(m => m.type === 'income').length
  const expenseCount = movements.filter(m => m.type === 'expense').length

  const pilBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: active ? COLORS.primary : '#fff', color: active ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc' })

  return (
    <div className="anim-fade">
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, whiteSpace: 'nowrap' }}>{toast}</div>}
      {showIncome && <IncomeModal items={filteredStock} onClose={() => setShowIncome(false)} onSubmit={handleIncome} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>🏭 Центр-Склад</div>
          <div style={{ fontSize: 13, color: '#5f5952', marginTop: 2 }}>Остатки и движение товаров</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>⟳ Обновить</button>
          <button onClick={() => setShowIncome(true)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>+ Приход</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Позиций', val: totalItems, sub: 'наименований', color: '#211f1c', bg: '#fff' },
          { label: 'В резерве', val: reservedCount, sub: 'товаров заморожено', color: '#4a5aaa', bg: '#eef2ff' },
          { label: 'Приходов', val: incomeCount, sub: 'операций всего', color: '#2e8a5e', bg: '#e8f5ee' },
          { label: 'Расходов', val: expenseCount, sub: 'операций всего', color: '#b03020', bg: '#faeaea' },
        ].map(({ label, val, sub, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 12, padding: '16px 18px', boxShadow: '0 0 0 1.5px #e6e2dc' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5f5952', marginBottom: 4, letterSpacing: '.04em' }}>{label.toUpperCase()}</div>
            <div style={{ fontWeight: 700, fontSize: 28, color, lineHeight: 1 }}>{loading ? '—' : val}</div>
            <div style={{ fontSize: 12, color: '#5f5952', marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        {/* Остатки */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Остатки</div>
            <input style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid #e6e2dc', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: 200 }} placeholder="🔍 Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {loading ? <div style={{ color: '#5f5952', fontSize: 14, padding: '20px 0' }}>Загрузка...</div>
            : filteredStock.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14, padding: '20px 0' }}>{search ? 'Ничего не найдено' : 'На складе пусто'}</div>
            : (
              <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f8f6f3' }}>{['НОМЕНКЛАТУРА', 'ЕД.', 'НА СКЛАДЕ', 'РЕЗЕРВ', 'ДОСТУПНО'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: h === 'НОМЕНКЛАТУРА' ? 'left' : 'center', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredStock.map((s, i) => {
                      const available = Math.max(0, s.qty - s.reserved)
                      const availPct = s.qty > 0 ? Math.round(available / s.qty * 100) : 0
                      const isLow = available === 0 && s.qty > 0, isCrit = s.qty === 0
                      return (
                        <tr key={s.id} style={{ borderTop: i > 0 ? '1px solid #f1efec' : 'none', background: isCrit ? '#fff5f5' : isLow ? '#fffbf0' : '#fff' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                            {s.cat && <div style={{ fontSize: 12, color: '#5f5952' }}>{s.cat}</div>}
                            <Bar pct={availPct} color={availPct >= 50 ? '#3a9d6e' : availPct > 0 ? '#c4a832' : '#d4613a'} />
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, color: '#5f5952' }}>{s.unit}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 14, fontWeight: 700 }}>{s.qty}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>{s.reserved > 0 ? <span style={{ fontSize: 13, fontWeight: 600, background: '#eef2ff', color: '#4a5aaa', padding: '2px 8px', borderRadius: 20 }}>🔒 {s.reserved}</span> : <span style={{ fontSize: 13, color: '#837c72' }}>—</span>}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: available === 0 ? '#b03020' : available < s.qty * 0.2 ? '#c4a832' : '#2e8a5e' }}>{available}</span>
                            {isLow && <div style={{ fontSize: 12, color: '#b03020', fontWeight: 600 }}>всё резерв</div>}
                            {isCrit && <div style={{ fontSize: 12, color: '#b03020', fontWeight: 600 }}>нет на складе</div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredStock.length > 0 && (
                  <div style={{ padding: '10px 14px', background: '#f8f6f3', borderTop: '1px solid #e6e2dc', display: 'flex', gap: 20, fontSize: 13, color: '#5f5952', flexWrap: 'wrap' }}>
                    <span>Итого позиций: <b style={{ color: '#26231f' }}>{filteredStock.length}</b></span>
                    <span>Всего в резерве: <b style={{ color: '#4a5aaa' }}>{filteredStock.reduce((s, i) => s + i.reserved, 0)}</b></span>
                    <span>Доступно товаров: <b style={{ color: '#2e8a5e' }}>{filteredStock.reduce((s, i) => s + Math.max(0, i.qty - i.reserved), 0)}</b></span>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Движение */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Движение</div>
          <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
            {([['all', `Все (${movements.length})`], ['income', `📥 Приход (${incomeCount})`], ['reserve', `🔒 Резервы (${movements.filter(m => m.type === 'reserve').length})`], ['expense', `📤 Расход (${expenseCount})`]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setMovTab(key)} style={pilBtn(movTab === key)}>{label}</button>
            ))}
          </div>
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
            {loading ? <div style={{ padding: '20px', color: '#5f5952', fontSize: 14 }}>Загрузка...</div>
              : filteredMovements.length === 0 ? <div style={{ padding: '20px', color: '#5f5952', fontSize: 14, textAlign: 'center' }}>Нет движений</div>
              : filteredMovements.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < filteredMovements.length - 1 ? '1px solid #f1efec' : 'none' }}>
                  <TypeBadge type={m.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    {m.cardId ? <button onClick={() => onOpenCard?.(m.cardId!)} style={{ fontSize: 12, color: COLORS.primary, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}>{m.cardId} →</button> : <div style={{ fontSize: 12, color: '#837c72' }}>ручной приход</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: m.type === 'income' ? '#2e8a5e' : m.type === 'reserve' ? '#4a5aaa' : '#b03020' }}>{fmtQty(m.type, m.qty)} {m.unit}</div>
                    <div style={{ fontSize: 12, color: '#5f5952' }}>{fmtTime(m.createdAt)}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
