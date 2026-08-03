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
- ✅ Репо + `nextjs/`, Drizzle/Zod, схема БД (12 таблиц) в Neon (`db:push`).
- ✅ `.env.local` с DATABASE_URL (локально, не в гит), `.gitignore` закрывает секреты.
- ✅ **Документ «Приход» (закуп) — готов и проверен на Neon:**
  - Слои: `dto/document.dto.ts` (zod) → `services/document.service.ts` (проводка) →
    `repositories/{document,refs}.repo.ts` → `db`. `lib/num.ts` (номера ЗП/ПР).
  - Проводка атомарна (`db.batch`): documents + document_lines + stock_movements.
  - Роуты: `POST/GET /api/documents`, `GET /api/refs`, `POST /api/seed`.
  - Страница `/documents` (форма + список), главная → редирект на /documents.
  - Smoke ✅: seed + приход ЗП-0001 на 210000 создан, прочитан. tsc+build зелёные.
- Старт-данные засеяны (org «U2B головной», Центр-Склад, 2 поставщика, 3 товара).
  Тестовый приход ЗП-0001 — демо, можно удалить.

## Следующие шаги
1. **Задеплоить на Vercel** (Root Directory = `nextjs`, env DATABASE_URL) → проверить `/documents` на проде.
2. Документ **Расход (продажа)**: списание склада (`stock_movement −`) + `doc_link` на приход (себестоимость) + долг заказчика. Аналогично слоями.
3. **Оплаты** (`payment` in/out) + экран.
4. **Финанс/дашборд**: долги контрагентов, остатки склада/денег — SQL-агрегатами.
5. **Начальные остатки**: импорт из 1С (Excel) в `opening_balance`.
После каждого шага: `tsc --noEmit` → `build` → smoke → commit → push → прод.
