import { NextRequest, NextResponse } from 'next/server'
import { listFolders, createFolder, renameFolder, deleteFolder } from '@/repositories/catalog.repo'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Дерево папок номенклатуры (все уровни, плоским списком grp/cat/sub).
export async function GET() {
  return NextResponse.json(await listFolders())
}

// Создать папку. b = { grp, cat?, sub? } — последний непустой сегмент = имя новой папки.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await createFolder(b.grp || '', b.cat || '', b.sub || ''))
}

// Переименовать папку. b = { grp, cat?, sub?, name }.
export async function PATCH(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await renameFolder(b.grp || '', b.cat || '', b.sub || '', b.name || ''))
}

// Удалить папку (только пустую). b = { grp, cat?, sub? }.
export async function DELETE(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await deleteFolder(b.grp || '', b.cat || '', b.sub || ''))
}
