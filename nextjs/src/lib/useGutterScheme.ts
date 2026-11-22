'use client'
// Общая логика «Водосток → Модерн бюджет открывается схемой» для всех каталогов
// (StoreCatalog, касса магазина, «Расчёт»): какая RAL-папка выбрана, показывать схему или список.
import { useEffect, useMemo, useRef, useState } from 'react'
import { gutterRals, isGutterCat } from '@/lib/gutterParts'

const KEY = 'u2b_vodostok_ral'
export const loadGutterRal = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
export const saveGutterRal = (ral: string) => { try { localStorage.setItem(KEY, ral) } catch { /* нет доступа к хранилищу */ } }

// Только выбор RAL (без привязки к папкам каталога) — для экранов, где схема открывается кнопкой.
export function useGutterRal(products: any[]) {
  const gRals = useMemo(() => gutterRals(products), [products])
  const [saved, setSaved] = useState('')
  useEffect(() => { setSaved(loadGutterRal()) }, [])
  const gRal = ((gRals.find(x => x.ral === saved) || gRals[0]) || { ral: '' }).ral
  return { gRals, gRal, setRal: (ral: string) => { setSaved(ral); saveGutterRal(ral) } }
}

// Каталог с папками: папка «Водосток» сама встаёт в серию со схемой, RAL = подпапка серии.
export function useGutterScheme(products: any[], folder: string, path: string[], setPath: (p: string[]) => void, q: string) {
  const [scheme, setScheme] = useState(true)
  const [saved, setSaved] = useState('')
  useEffect(() => { setSaved(loadGutterRal()) }, [])
  const gCat = useMemo(() => ((products.find(isGutterCat) || {}).cat || '').trim(), [products])
  const gRals = useMemo(() => gutterRals(products), [products])
  // Каталог открывается на «Водостоке» — сразу встаём в серию (один раз, дальше как выберет человек).
  const auto = useRef(false)
  useEffect(() => {
    if (!gCat || auto.current) return
    auto.current = true
    if (folder === 'vodostok' && path.length === 0) setPath([gCat])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gCat])
  const inGutter = folder === 'vodostok' && !!gCat && (path[0] || '') === gCat && gRals.length > 0
  const showScheme = inGutter && scheme && !(q || '').trim()
  const gRal = ((gRals.find(x => x.sub === path[1]) || gRals.find(x => x.ral === saved) || gRals[0]) || { ral: '' }).ral
  function pickRal(ral: string) {
    const x = gRals.find(y => y.ral === ral); if (!x) return
    setPath([gCat, x.sub]); setSaved(ral); saveGutterRal(ral)
  }
  return { scheme, setScheme, gCat, gRals, gRal, inGutter, showScheme, pickRal }
}
