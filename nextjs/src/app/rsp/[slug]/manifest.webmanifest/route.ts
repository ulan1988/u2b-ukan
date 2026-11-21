import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// МАНИФЕСТ КАБИНЕТА ЛОГИСТА. Общий /manifest.json открывает корень сайта, поэтому у доски
// свой манифест со СВОИМ start_url: установленный значок открывает сразу /rsp/<slug>,
// как у приёма заказов (/order.webmanifest). Делаем роутом, а не файлом, — slug у каждого свой.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const base = `/rsp/${params.slug}`
  return NextResponse.json({
    id: base,
    name: 'U-Kan Логист',
    short_name: 'U-Kan',
    description: 'Доска логиста: заказы по поставщикам, остаток склада, смена',
    start_url: base,
    // scope ВСЕГО сайта: страница, с которой ставят (например /install), обязана быть внутри
    // scope — иначе Chrome вообще не читает манифест и кнопки установки нет.
    scope: '/',
    display: 'standalone',
    background_color: '#0079bf',
    theme_color: '#0079bf',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'content-type': 'application/manifest+json' } })
}
