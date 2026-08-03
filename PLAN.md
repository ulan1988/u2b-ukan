# PLAN — u2b-ukan (ERP-ядро)

> Читать ПЕРВЫМ в каждой сессии. Обновлять после каждого значимого шага.
> Метод построения — `U:\METHOD.md` (слои Controller→dto→service→repository→db).
> Схема БД — `docs/SCHEMA.md`.

## Цель
Новое ядро ERP по образцу 1С:УНФ, но в своей модели и визуализации: цепочка
документов (закуп → приходные накладные по поставщикам → доставка → расходная →
финанс/дашборд), двойная проводка, долги/оплаты, склады, производство. Мульти-орг
(мы + 2 филиала: производитель+продавец и чистый продавец). Расчёты SQL-агрегатами.

## Стек
Next.js 14 (App Router, `--src-dir`) + TS + Tailwind + Neon Postgres (pooler) +
Drizzle ORM + Zod. Деплой Vercel (Root Directory = `nextjs`). Репо публичный
`github.com/ulan1988/u2b-ukan` — секреты только в `.env.local` (в .gitignore).

## Статус
- ✅ Репо + `nextjs/` (create-next-app), Drizzle/Zod установлены.
- ✅ Схема БД в `src/db/schema.ts` (13 таблиц: organizations, users, contragents,
  products, warehouses, cash_accounts, documents, document_lines, doc_links,
  payments, stock_movements, opening_balances). tsc зелёный.
- ✅ `src/lib/db.ts` (Neon+Drizzle), `drizzle.config.ts`, `.gitignore` (секреты закрыты).
- ⏳ **Ждём `DATABASE_URL`** (Neon pooler) → положить в `nextjs/.env.local`.

## Следующие шаги
1. Получить `DATABASE_URL` → `.env.local` → `npm run db:push` (создать таблицы в Neon).
2. Слои: `dto/`, `services/`, `repositories/`. Первый документ — **Приход (закуп)**:
   repo → service (проводка: строки + stock_movement + долг поставщику) → route (zod) → страница.
3. Дальше по одному: Расход (продажа) + doc_link, Оплаты, Финанс/дашборд (долги
   SQL-агрегатами), Начальные остатки (импорт из 1С Excel).
После каждого шага: `tsc --noEmit` → `build` → smoke API → commit → push → прод.
