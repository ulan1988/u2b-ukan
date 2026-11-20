import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Доска переехала на корень кабинета — старую ссылку держим рабочей.
export default function LogistBoardAlias({ params }: { params: { slug: string } }) {
  redirect(`/rsp/${params.slug}`)
}
