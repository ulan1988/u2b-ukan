import { NextRequest, NextResponse } from 'next/server'
import { userBySlug } from '@/services/auth.service'
import { orgById } from '@/repositories/refs.repo'

export const dynamic = 'force-dynamic'

// Отдельный устанавливаемый PWA для кабинета филиала: своё имя/иконка, start_url = ссылка кабинета.
// Магазин (seller) → «Касса магазина», производитель → «Кабинет мастера». Один манифест на slug.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = params.slug
  let name = 'Кабинет филиала', short = 'Кабинет'
  try {
    const u = await userBySlug(slug)
    if (u) {
      const org = await orgById(u.orgId)
      if (org?.kind === 'seller') { name = 'Касса магазина'; short = 'Касса' }
      else if (org?.kind === 'producer_seller') { name = 'Кабинет мастера'; short = 'Мастер' }
      else if (org?.name) { name = org.name; short = org.name.slice(0, 12) }
    }
  } catch { /* имя по умолчанию */ }
  const manifest = {
    id: `/branch/${slug}`,
    name,
    short_name: short,
    description: name,
    start_url: `/branch/${slug}`,
    scope: `/branch/${slug}`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#26231f',
    theme_color: '#d4613a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return NextResponse.json(manifest, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } })
}
