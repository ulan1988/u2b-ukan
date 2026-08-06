'use client'
import { useState, useCallback, useEffect, memo } from 'react'
import { useLiveData } from '@/lib/live'
import { chatThreads } from '@/lib/api/orders'
import CardChat from './CardChat'

const PRIMARY = '#d4613a'
const DARK = '#211f1c'

interface Thread { cardId: string; from: string; to: string; count: number; lastText: string; lastAuthor: string; lastRole: string; lastAt: string | null }

function fmtWhen(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `${hh}:${mm}`
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`
}
const seenKey = (cardId: string) => `chat-seen-${cardId}`

// Плавающий чат-виджет: пузырь в правом нижнем углу + список чатов по заказам,
// «новые» = позже моего lastSeen (localStorage). orgId — скоуп по организации/филиалу.
function ChatWidget({ myId, orgId, bottomOffset = 24 }: { myId: string; orgId?: string; bottomOffset?: number }) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [open, setOpen] = useState(false)
  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const load = useCallback(async () => {
    try { const d = await chatThreads(orgId) as Thread[]; setThreads(Array.isArray(d) ? d : []) } catch {}
  }, [orgId])
  useLiveData(load, [orgId])

  function isNew(t: Thread): boolean {
    if (!mounted || !t.lastAt) return false
    const seen = localStorage.getItem(seenKey(t.cardId))
    return !seen || new Date(t.lastAt).getTime() > new Date(seen).getTime()
  }
  const newCount = threads.filter(isNew).length
  function openThread(cardId: string) { localStorage.setItem(seenKey(cardId), new Date().toISOString()); setActiveCard(cardId) }
  const active = threads.find(t => t.cardId === activeCard)

  return (
    <>
      {!open && (
        <button onClick={() => { setOpen(true); load() }} aria-label="Чаты"
          style={{ position: 'fixed', right: 18, bottom: bottomOffset, zIndex: 8000, width: 56, height: 56, borderRadius: '50%', border: 'none', background: PRIMARY, color: '#fff', fontSize: 24, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          💬
          {mounted && newCount > 0 && (
            <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 10, background: '#b03020', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px #fff' }}>{newCount}</span>
          )}
        </button>
      )}

      {open && (
        <div style={{ position: 'fixed', right: 16, bottom: bottomOffset, zIndex: 8000, width: 'min(360px, calc(100vw - 24px))', height: 'min(72vh, 560px)', background: '#fff', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'inherit' }}>
          <div style={{ background: DARK, color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {active ? <button onClick={() => setActiveCard(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button> : <span style={{ fontSize: 18 }}>💬</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active ? active.cardId : 'Чаты по заказам'}</div>
              {active && <div style={{ fontSize: 12, color: '#8c857a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.from} → {active.to || '—'}</div>}
            </div>
            <button onClick={() => { setOpen(false); setActiveCard(null) }} style={{ background: 'none', border: 'none', color: '#8c857a', fontSize: 20, cursor: 'pointer', padding: 0 }}>✕</button>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {active ? (
              <div style={{ flex: 1, padding: '10px 12px', overflow: 'hidden' }}><CardChat cardId={active.cardId} myId={myId} height="100%" /></div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {threads.length === 0
                  ? <div style={{ color: '#5f5952', fontSize: 14, textAlign: 'center', padding: 30 }}>Пока нет чатов по заказам</div>
                  : threads.map(t => (
                    <button key={t.cardId} onClick={() => openThread(t.cardId)}
                      style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #f1efec', background: '#fff', padding: '11px 14px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: 'inherit' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: PRIMARY }}>{t.cardId}</span>
                          <span style={{ fontSize: 12, color: '#6b645b' }}>{fmtWhen(t.lastAt)}</span>
                          {isNew(t) && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#b03020', flexShrink: 0 }} />}
                        </div>
                        <div style={{ fontSize: 13, color: '#26231f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#5f5952' }}>{t.lastAuthor}:</span> {t.lastText}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', background: '#f1efec', borderRadius: 10, padding: '1px 7px', flexShrink: 0 }}>{t.count}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default memo(ChatWidget)
