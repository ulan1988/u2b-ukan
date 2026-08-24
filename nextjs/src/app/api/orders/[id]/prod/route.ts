import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// УДАЛЁННЫЙ РОУТ. Старый поток раскроя (stage: 'cut' | 'bent' → статусы «Распил»/«Листогиб»)
// убран: он писал статус карточки мимо prod_phase, из-за чего карточки застревали вне стола
// мастера. Актуальная цепочка — produceAccept → produceStart → produceReady → /send.
// Заглушка оставлена, чтобы старые вкладки получали внятный ответ, а не 404-страницу.
// Файл можно удалить целиком: git rm "nextjs/src/app/api/orders/[id]/prod/route.ts"
export async function POST() {
  return NextResponse.json(
    { error: 'Этап раскроя убран. Используйте produceAccept / produceStart / produceReady.' },
    { status: 410 },
  )
}
