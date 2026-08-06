'use client'
// Трекинг (публичный) — портирован из Улкана 1:1. Вкладки Отслеживание / Подать заявку,
// таймлайн 5 шагов, позиции, детали, история, запрос изменения. Вход по телефону →
// ведёт на защищённый /login (беспарольный вход не подключён — дыра v1).
import { useState, useEffect, Suspense } from 'react'
import { RalDot, extractRal } from '@/lib/ral'

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2300); return () => clearTimeout(t) }, [onClose])
  return <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, whiteSpace: 'nowrap' }}>{msg}</div>
}
const STEPS = ['Заявка', 'Принят', 'В работе', 'Готово', 'Доставлено']
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    'В ожидании': { bg: '#eef2ff', color: '#4a5aaa' }, 'Принят': { bg: '#fff0ea', color: '#c0532a' }, 'В обработке': { bg: '#fff0ea', color: '#c0532a' }, 'В работе': { bg: '#fff0ea', color: '#c0532a' },
    'В пути': { bg: '#fdf8e1', color: '#8a6f00' }, 'Доставлено': { bg: '#e8f5ee', color: '#2e8a5e' }, 'К учёту': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Проведён': { bg: '#e8f5ee', color: '#2e8a5e' }, 'Архив': { bg: '#eef2ff', color: '#4a5aaa' }, 'Отменён': { bg: '#faeaea', color: '#b03020' },
  }
  const s = map[status] || { bg: '#efece8', color: '#6b655b' }
  return <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, fontWeight: 600, background: s.bg, color: s.color }}>{status}</span>
}
const barColor = (pct: number) => pct >= 100 ? '#3a9d6e' : pct >= 60 ? '#c4a832' : '#d4613a'
const fmtTime = (iso: string) => { const d = new Date(iso), diff = Math.floor((Date.now() - d.getTime()) / 60000); if (diff < 1) return 'только что'; if (diff < 60) return `${diff} мин`; if (diff < 1440) return `${Math.floor(diff / 60)} ч`; return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) }

function Track() {
  const [tab, setTab] = useState<'track' | 'submit'>('track')
  const [searchId, setSearchId] = useState('')
  const [trackData, setTrackData] = useState<any>(null)
  const [trackErr, setTrackErr] = useState(''); const [trackLoading, setTrackLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [changeText, setChangeText] = useState(''); const [changePhone, setChangePhone] = useState('+7'); const [changeSent, setChangeSent] = useState(false)
  const [subName, setSubName] = useState(''); const [subPhone, setSubPhone] = useState('+7'); const [subText, setSubText] = useState('')
  const [subResult, setSubResult] = useState<any>(null); const [subLoading, setSubLoading] = useState(false); const [subErr, setSubErr] = useState(''); const [subCopied, setSubCopied] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id'); if (id) { setSearchId(id); doSearch(id) }
    if (params.get('tab') === 'submit') setTab('submit')
  }, [])

  async function doSearch(id?: string) {
    const qid = (id || searchId).trim(); if (!qid) return
    setTrackLoading(true); setTrackErr(''); setTrackData(null); setChangeSent(false)
    const res = await fetch(`/api/track?id=${encodeURIComponent(qid)}`); const d = await res.json().catch(() => ({}))
    setTrackLoading(false)
    if (!res.ok) { setTrackErr(d.error || 'Заказ не найден'); return }
    setTrackData(d)
  }
  async function handleChange(e: React.FormEvent) {
    e.preventDefault(); if (!trackData) return
    await fetch('/api/track/change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardId: trackData.id, text: changeText, phone: changePhone }) })
    setChangeSent(true); setToast('✓ Изменение отправлено менеджеру')
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSubErr(''); setSubLoading(true)
    const res = await fetch('/api/track/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: subName, phone: subPhone, text: subText }) })
    const d = await res.json().catch(() => ({})); setSubLoading(false)
    if (!res.ok) { setSubErr(d.error || 'Ошибка'); return }
    setSubResult(d)
  }
  function copy(text: string, key: string) { navigator.clipboard.writeText(text); setSubCopied(key); setTimeout(() => setSubCopied(''), 2000); setToast('Скопировано!') }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  const btn = (v: 'primary' | 'default' = 'default'): React.CSSProperties => ({ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: v === 'primary' ? '#d4613a' : '#fff', color: v === 'primary' ? '#fff' : '#26231f', boxShadow: v === 'default' ? '0 0 0 1px #e6e2dc' : 'none' })

  return (
    <div style={{ minHeight: '100vh', background: '#f1efec', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 38, height: 38, background: '#d4613a', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 17 }}>U</div>
          <div><div style={{ fontWeight: 700, fontSize: 17 }}>U2B</div><div style={{ fontSize: 12, color: '#5f5952' }}>Отслеживание заказа</div></div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><a href="/login" style={{ ...btn(), textDecoration: 'none' }}>👤 Войти</a></div>
        </div>

        <div style={{ display: 'flex', gap: 4, background: '#e6e2dc', borderRadius: 10, padding: 4, marginBottom: 24, width: 'fit-content' }}>
          {(['track', 'submit'] as const).map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#211f1c' : '#5f5952', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none' }}>{t === 'track' ? '📦 Отслеживание заказа' : '✨ Подать заявку'}</button>)}
        </div>

        {tab === 'track' && (
          <div className="anim-fade">
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 0 0 1px #e6e2dc' }}>
              <div style={{ display: 'flex', gap: 8 }}><input style={{ ...inp, flex: 1, fontFamily: "'JetBrains Mono', monospace" }} value={searchId} onChange={e => setSearchId(e.target.value)} placeholder="ПР-0001-…" onKeyDown={e => e.key === 'Enter' && doSearch()} /><button onClick={() => doSearch()} style={{ ...btn('primary'), whiteSpace: 'nowrap' }}>Найти →</button></div>
            </div>
            {trackLoading && <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка...</div>}
            {trackErr && <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 10, padding: 16, fontSize: 14 }}>{trackErr}</div>}
            {trackData && (
              <div className="anim-fade">
                <div style={{ background: '#fff', borderRadius: 14, padding: 24, marginBottom: 16, boxShadow: '0 0 0 1px #e6e2dc' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 32 }}>{trackData.cancelled ? '❌' : trackData.stage >= 5 ? '✅' : trackData.stage >= 3 ? '🚚' : '🏗'}</div>
                      <div><StatusBadge status={trackData.status} /><div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 18, marginTop: 4 }}>{trackData.id}</div></div>
                    </div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 28, fontWeight: 700, color: barColor(trackData.progress) }}>{trackData.progress}%</div></div>
                  </div>
                  <div style={{ height: 6, background: '#f1efec', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}><div style={{ height: '100%', width: `${trackData.progress}%`, background: barColor(trackData.progress), transition: 'width .5s ease', borderRadius: 4 }} /></div>
                  {trackData.cancelled ? <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>❌ Заказ отменён{trackData.cancelReason ? `: ${trackData.cancelReason}` : ''}</div>
                    : <div style={{ display: 'flex', gap: 0 }}>{STEPS.map((step, i) => { const done = i + 1 < trackData.stage; const current = i + 1 === trackData.stage; return <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>{i > 0 && <div style={{ position: 'absolute', top: 13, right: '50%', left: '-50%', height: 2, background: done ? '#3a9d6e' : '#e6e2dc', zIndex: 0 }} />}<div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, fontSize: 12, fontWeight: 700, background: done ? '#3a9d6e' : current ? '#d4613a' : '#e6e2dc', color: done || current ? '#fff' : '#5f5952' }}>{done ? '✓' : i + 1}</div><div style={{ fontSize: 12, color: done ? '#2e8a5e' : current ? '#d4613a' : '#5f5952', marginTop: 6, fontWeight: current ? 700 : 400, textAlign: 'center' }}>{step}</div></div> })}</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1px #e6e2dc' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Позиции заказа</div>
                      {trackData.positions.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14 }}>Позиции не сформированы</div>
                        : trackData.positions.map((p: any, i: number) => <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < trackData.positions.length - 1 ? '1px solid #f1efec' : 'none' }}><div><div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><RalDot code={extractRal(p.name)} size={13} />{p.name}</div><div style={{ fontSize: 13, color: '#5f5952' }}>{p.qty} {p.unit}</div></div><StatusBadge status={p.status} /></div>)}
                    </div>
                    {trackData.status !== 'Доставлено' && trackData.status !== 'Архив' && !trackData.cancelled && (
                      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1px #e6e2dc' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Внести изменение</div>
                        {changeSent ? <div style={{ color: '#2e8a5e', fontSize: 14, padding: '10px 0' }}>✓ Изменение отправлено менеджеру</div>
                          : <form onSubmit={handleChange} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><textarea style={{ ...inp, resize: 'vertical', minHeight: 80 }} value={changeText} onChange={e => setChangeText(e.target.value)} placeholder="Текст изменения..." required /><input style={inp} value={changePhone} onChange={e => setChangePhone(e.target.value)} placeholder="+7 ___ ___ __ __" /><button type="submit" style={btn('primary')}>Отправить</button></form>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1px #e6e2dc' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Детали заказа</div>
                      {trackData.details.map((d: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < trackData.details.length - 1 ? '1px solid #f1efec' : 'none' }}><span style={{ fontSize: 13, color: '#5f5952' }}>{d.k}</span><span style={{ fontSize: 14, fontWeight: 500 }}>{d.v}</span></div>)}
                    </div>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1px #e6e2dc' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>История</div>
                      {trackData.history.slice(0, 6).map((h: any, i: number) => <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: i < Math.min(trackData.history.length, 6) - 1 ? '1px solid #f1efec' : 'none', alignItems: 'flex-start' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? '#d4613a' : '#d8d3cc', marginTop: 6, flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 14 }}>{h.action}</div><div style={{ fontSize: 12, color: '#5f5952' }}>{fmtTime(h.time)}</div></div></div>)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'submit' && (
          <div className="anim-fade">
            {subResult ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: 32, boxShadow: '0 0 0 1px #e6e2dc', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#2e8a5e', marginBottom: 8 }}>Заявка {subResult.cardId} принята!</div>
                <p style={{ color: '#5f5952', fontSize: 14, marginBottom: 20 }}>Сохраните ссылку для отслеживания</p>
                <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#5f5952', marginBottom: 4, textAlign: 'left' }}>ТРЕКИНГ</div><div style={{ display: 'flex', gap: 8 }}><span style={{ flex: 1, background: '#f1efec', borderRadius: 7, padding: '8px 12px', fontSize: 13, wordBreak: 'break-all', textAlign: 'left' }}>{subResult.trackingUrl}</span><button onClick={() => copy(subResult.trackingUrl, 'trk')} style={btn()}>{subCopied === 'trk' ? '✓' : '📋'}</button></div></div>
                <button onClick={() => { setSubResult(null); setSubName(''); setSubPhone('+7'); setSubText(''); setTab('track'); setSearchId(subResult.cardId); doSearch(subResult.cardId) }} style={{ display: 'block', width: '100%', marginTop: 16, padding: '12px', background: '#d4613a', color: '#fff', borderRadius: 8, fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>Отследить заявку →</button>
              </div>
            ) : (
              <div style={{ maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 0 0 1px #e6e2dc' }}>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Подать заявку</div>
                <div style={{ color: '#5f5952', fontSize: 14, marginBottom: 24 }}>Заполните форму — получите ссылку для отслеживания</div>
                {subErr && <div style={{ background: '#faeaea', color: '#b03020', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>{subErr}</div>}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div><label style={{ fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }}>ФИО / КОМПАНИЯ *</label><input style={inp} value={subName} onChange={e => setSubName(e.target.value)} placeholder="Нипа Алматы" required /></div>
                  <div><label style={{ fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }}>ТЕЛЕФОН *</label><input style={inp} value={subPhone} onChange={e => setSubPhone(e.target.value)} placeholder="+7 700 000 00 00" required /></div>
                  <div><label style={{ fontSize: 13, fontWeight: 600, color: '#5f5952', marginBottom: 4, display: 'block' }}>ТЕКСТ ЗАЯВКИ *</label><textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={subText} onChange={e => setSubText(e.target.value)} placeholder="Опишите что нужно..." required /></div>
                  <button type="submit" disabled={subLoading} style={{ ...btn('primary'), padding: '12px', fontSize: 15, fontWeight: 700 }}>{subLoading ? 'Отправка...' : 'ОТПРАВИТЬ ЗАЯВКУ →'}</button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TrackPage() {
  return <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f1efec' }} />}><Track /></Suspense>
}
