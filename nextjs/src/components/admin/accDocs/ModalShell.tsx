'use client'
// Общая оболочка окон Бухгалтерии: выводится в <body> (иначе анимированный родитель обрезает fixed-окно),
// шапка с крестиком закреплена при прокрутке, закрытие: ✕, клик по фону, Esc, кнопка «Закрыть» внизу.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLORS } from '@/lib/colors'

export default function ModalShell({ title, onClose, children, width = 760 }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  if (!mounted) return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,40,.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: `min(${width}px, 100%)`, maxHeight: '94vh', overflowY: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.35)', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#fff', borderBottom: '1px solid #eef0f3', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 17, flex: 1, minWidth: 0 }}>{title}</div>
          <button onClick={onClose} title="Закрыть (Esc)" style={{ width: 36, height: 36, borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 18, cursor: 'pointer', color: COLORS.text, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #eef0f3', padding: '10px 18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Закрыть</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
