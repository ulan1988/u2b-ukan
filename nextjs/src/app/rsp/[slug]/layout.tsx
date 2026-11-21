import type { Metadata } from 'next'

// Кабинет логиста ставится на телефон отдельным приложением: свой манифест (start_url =
// сам кабинет) и своё имя значка. Баннер «Установить» рисует InstallApp на доске.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return {
    title: 'U-Kan Логист',
    manifest: `/rsp/${params.slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: 'U-Kan', statusBarStyle: 'black-translucent' },
  }
}

export default function RspLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
