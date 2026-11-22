'use client'
// Общая логика «водосток открывается схемой» для всех каталогов (StoreCatalog, касса магазина, «Расчёт»):
// какая серия (Модерн бюджет / Дёке) и какая её папка (RAL / класс) выбраны, показывать схему или список.
import { useEffect, useMemo, useRef, useState } from 'react'
import { GUTTER_SYSTEMS, gutterCatName, type GutterFolder, type GutterSystem } from '@/lib/gutterParts'

const load = (key: string) => { try { return localStorage.getItem(key) || '' } catch { return '' } }
const save = (key: string, v: string) => { try { localStorage.setItem(key, v) } catch { /* нет доступа к хранилищу */ } }

interface Present { sys: GutterSystem; cat: string; folders: GutterFolder[] }
// Серии, которые есть в номенклатуре этой орг (с их папками).
function usePresent(products: any[]) {
  const present = useMemo<Present[]>(() => GUTTER_SYSTEMS
    .map(sys => ({ sys, cat: gutterCatName(products, sys), folders: sys.folders(products) }))
    .filter(x => x.cat && x.folders.length > 0), [products])
  const [saved, setSaved] = useState<Record<string, string>>({})
  useEffect(() => { const m: Record<string, string> = {}; for (const s of GUTTER_SYSTEMS) m[s.id] = load(s.saveKey); setSaved(m) }, [])
  const remember = (sys: GutterSystem, key: string) => { setSaved(m => ({ ...m, [sys.id]: key })); save(sys.saveKey, key) }
  return { present, saved, remember }
}

// Экран, где схема открывается кнопкой (без привязки к папкам каталога): выбор серии и её папки.
export function useGutterPanel(products: any[]) {
  const { present, saved, remember } = usePresent(products)
  const [sysId, setSysId] = useState('')
  const cur = present.find(x => x.sys.id === sysId) || present[0]
  const gFolder = cur ? (cur.folders.find(f => f.key === saved[cur.sys.id]) || cur.folders[0]) : undefined
  return { present, cur, gFolder, setSysId, pick: (key: string) => { if (cur) remember(cur.sys, key) } }
}

// Каталог с папками: «Водосток» сам встаёт в первую серию со схемой; папка серии = подпапка каталога.
export function useGutterScheme(products: any[], folder: string, path: string[], setPath: (p: string[]) => void, q: string) {
  const [scheme, setScheme] = useState(true)
  const { present, saved, remember } = usePresent(products)
  const gCat = present[0] ? present[0].cat : ''
  // Каталог открывается на «Водостоке» — сразу встаём в серию (один раз, дальше как выберет человек).
  const auto = useRef(false)
  useEffect(() => {
    if (!gCat || auto.current) return
    auto.current = true
    if (folder === 'vodostok' && path.length === 0) setPath([gCat])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gCat])
  const cur = folder === 'vodostok' ? present.find(x => x.cat === (path[0] || '')) : undefined
  const inGutter = !!cur
  const showScheme = inGutter && scheme && !(q || '').trim()
  const gFolder = cur ? (cur.folders.find(f => f.sub === path[1]) || cur.folders.find(f => f.key === saved[cur.sys.id]) || cur.folders[0]) : undefined
  function pick(key: string) {
    if (!cur) return
    const f = cur.folders.find(y => y.key === key); if (!f) return
    setPath([cur.cat, f.sub]); remember(cur.sys, key)
  }
  return { scheme, setScheme, gCat, inGutter, showScheme, sys: cur ? cur.sys : undefined, folders: cur ? cur.folders : [], gFolder, pick }
}
