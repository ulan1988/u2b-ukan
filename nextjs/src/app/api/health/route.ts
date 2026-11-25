import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Проверка живости деплоя: GET /api/health → { ok: true, sha }.
// sha — короткий SHA выложенной версии (тот же, что зашит в страницу как NEXT_PUBLIC_BUILD_SHA): открытая вкладка
// сравнивает свой со свежим и, если вышла новая версия, предлагает обновиться (components/UpdateNotice).
export async function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString(), sha: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7) })
}
