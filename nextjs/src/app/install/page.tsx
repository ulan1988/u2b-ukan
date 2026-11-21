import type { Metadata } from 'next'
import InstallPanel from './InstallPanel'

export const dynamic = 'force-dynamic'

// СТРАНИЦА УСТАНОВКИ — открывается БЕЗ входа, её можно просто кинуть в WhatsApp.
// ?rsp=<slug> — ставим кабинет логиста (значок откроет сразу доску), без параметра —
// обычное приложение U2B ERP. Манифест подключаем прямо здесь, поэтому Chrome видит
// его на этой странице и даёт «Установить приложение».
export async function generateMetadata({ searchParams }: { searchParams: { rsp?: string } }): Promise<Metadata> {
  const slug = String(searchParams?.rsp || '').replace(/[^a-zA-Z0-9_-]/g, '')
  return {
    title: 'Установить U-Kan',
    manifest: slug ? `/rsp/${slug}/manifest.webmanifest` : '/manifest.json',
    appleWebApp: { capable: true, title: slug ? 'U-Kan' : 'U2B ERP', statusBarStyle: 'black-translucent' },
  }
}

export default function InstallPage({ searchParams }: { searchParams: { rsp?: string } }) {
  const slug = String(searchParams?.rsp || '').replace(/[^a-zA-Z0-9_-]/g, '')
  return <InstallPanel slug={slug} />
}
