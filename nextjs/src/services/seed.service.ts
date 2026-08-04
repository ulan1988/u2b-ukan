// Стартовые данные, чтобы система была сразу рабочей. Идемпотентно: сеет только
// если организаций ещё нет. Запросы — через seed.repo (структура сохранена).
import bcrypt from 'bcryptjs'
import * as repo from '../repositories/seed.repo'

export async function seedIfEmpty() {
  if ((await repo.countOrganizations()) > 0) return { seeded: false }

  const [org] = await repo.insertOrganization({ name: 'U2B головной', kind: 'hq' })
  await repo.insertOrganizations([
    { name: 'Филиал-производитель', kind: 'producer_seller' },
    { name: 'Филиал-продавец', kind: 'seller' },
  ])
  await repo.insertWarehouse({ orgId: org.id, name: 'Центр-Склад', isCentral: true })
  await repo.insertCashAccounts([
    { orgId: org.id, name: 'Касса', kind: 'cash' },
    { orgId: org.id, name: 'Банк (осн.)', kind: 'bank' },
  ])
  await repo.insertContragents([
    { orgId: org.id, name: 'Металл Профиль', kind: 'supplier' },
    { orgId: org.id, name: 'Нипа Листагиб', kind: 'supplier' },
    { orgId: org.id, name: 'Кристалл (заказчик)', kind: 'client' },
    { orgId: org.id, name: 'Астана Строй', kind: 'client' },
  ])
  await repo.insertProducts([
    { name: 'Желоб 9003 3м', unit: 'шт', category: 'goods', priceIn: '1500' },
    { name: 'Труба 7024 3м', unit: 'шт', category: 'goods', priceIn: '1200' },
    { name: 'Лист оцинкованный 0.5', unit: 'м2', category: 'material', priceIn: '900' },
  ])
  // Стартовый администратор: admin@u2b / admin123 (сменить пароль после входа).
  await repo.insertUser({
    orgId: org.id, name: 'Администратор', email: 'admin@u2b', role: 'admin',
    password: await bcrypt.hash('admin123', 10),
  })
  return { seeded: true, orgId: org.id }
}
