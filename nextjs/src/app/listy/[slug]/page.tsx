import SheetCabinetPublic from '@/components/portals/SheetCabinetPublic'

export const dynamic = 'force-dynamic'

// Публичный кабинет листов производителя по ссылке. Вход по имени (без пароля),
// каждый ввод пишется в журнал (кто внёс). Доступ открыт (см. middleware PUBLIC).
export default function ListySlugPage({ params }: { params: { slug: string } }) {
  return <SheetCabinetPublic slug={params.slug} />
}
