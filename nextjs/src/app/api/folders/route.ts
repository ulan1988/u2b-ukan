import { NextRequest, NextResponse } from 'next/server'
import { listFolders, createFolder, renameFolder, deleteFolder, moveFolder, setFolderHidden } from '@/repositories/catalog.repo'
import { sessionFromRequest } from '@/lib/auth'
import { ownerOrgFor } from '@/repositories/refs.repo'

export const dynamic = 'force-dynamic'

// Дерево папок номенклатуры (все уровни, плоским списком grp/cat/sub).
export async function GET(req: NextRequest) {
  // Папки филиала видит только он сам; папки головного (owner NULL) — все.
  const s = await sessionFromRequest(req)
  const orgId = new URL(req.url).searchParams.get('orgId') || s?.orgId
  return NextResponse.json(await listFolders(orgId || undefined))
}

// Создать папку. b = { grp, cat?, sub? } — последний непустой сегмент = имя новой папки.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  // Завёл головной — папка общая, завёл филиал — остаётся у него.
  return NextResponse.json(await createFolder(b.grp || '', b.cat || '', b.sub || '', await ownerOrgFor(b.orgId || s.orgId)))
}

// Переименовать папку { grp, cat?, sub?, name } ИЛИ скрыть/показать { grp, cat?, sub?, hidden }.
export async function PATCH(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (typeof b.hidden === 'boolean') return NextResponse.json(await setFolderHidden(b.grp || '', b.cat || '', b.sub || '', b.hidden))
  return NextResponse.json(await renameFolder(b.grp || '', b.cat || '', b.sub || '', b.name || ''))
}

// Перенести папку в другую (или на верхний уровень). b = { src:{grp,cat,sub}, dst:{grp,cat,sub} }.
export async function PUT(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const norm = (x: any) => ({ grp: x?.grp || '', cat: x?.cat || '', sub: x?.sub || '' })
  return NextResponse.json(await moveFolder(norm(b.src), norm(b.dst)))
}

// Удалить папку (только пустую). b = { grp, cat?, sub? }.
export async function DELETE(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await deleteFolder(b.grp || '', b.cat || '', b.sub || ''))
}
