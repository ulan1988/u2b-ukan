import { redirect } from 'next/navigation'

// Временно: полноценный AdminApp Улкана переносится по шагам. Пока админ
// попадает на рабочую доску заявок.
export default function AdminPage() {
  redirect('/board')
}
