# WeRepairRefrigerators — Project Analysis

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | Next.js 16.2.6, React 19, TypeScript, Tailwind CSS v4 |
| Auth + DB | Supabase (Auth, PostgreSQL, RLS, RPC functions) |
| Маршрутизация | Next.js App Router (`src/app/`) |
| Backend | **Отсутствует** — `/backend` и `/database` папки пустые |
| Инфраструктура | Docker Compose (не задействован), `.env.example` |

Никаких внешних API-интеграций в коде нет — всё через noop-провайдеры.

---

## Структура проекта

```
WeRepairRefrigerators/
├── frontend/               ← весь рабочий код
│   └── src/
│       ├── app/            ← 50+ маршрутов App Router
│       ├── components/     ← UI-компоненты (dashboard/, customer/, public/, ui/)
│       ├── lib/            ← бизнес-логика, Supabase-клиенты, интеграционный слой
│       ├── server/         ← server actions (auth, onboarding)
│       ├── types/          ← TypeScript-контракты
│       ├── data/           ← mock-данные
│       └── config/         ← nav конфиг
├── supabase/migrations/    ← 35+ SQL-миграций (часть применена, часть нет)
├── docs/                   ← обширная документация задач и архитектуры
├── WRA Platform Bible/     ← продуктовые .docx-документы
├── backend/                ← пусто
└── database/               ← пусто
```

---

## Реализованные маршруты (~50 страниц)

### Публичные
- `/` — главная (маркетинг)
- `/technicians`, `/technicians/[slug]` — каталог и профили техников
- `/brands`, `/brands/[brand]` — по брендам
- `/services`, `/services/[service]` — по типам услуг
- `/locations`, `/locations/[city]` — по городам
- `/repair-cases`, `/repair-cases/[slug]` — SEO-кейсы ремонтов
- `/find-technician`, `/schedule-service` — запись на ремонт
- `/estimates/[token]` — просмотр и подтверждение сметы клиентом

### Auth / Onboarding
- `/login`, `/signup`, `/onboarding`, `/account-status`
- `/customer/login`, `/customer/register`

### Дашборд техника (защищён)
- `/dashboard` — главная (реальные данные из Supabase)
- `/dashboard/leads`, `/dashboard/leads/[id]` — CRM инбокс заявок
- `/dashboard/repair-cases`, `/dashboard/repair-cases/[id]` — кейсы
- `/dashboard/customers`, `/dashboard/customers/[id]` — клиенты
- `/dashboard/technician-profile` — профиль техника
- `/dashboard/technician-schedule` — расписание (mock)
- `/dashboard/open-jobs` — биржа заданий (mock)
- `/dashboard/analytics` — аналитика (mock)
- `/dashboard/community`, `/dashboard/community/[id]` — сообщество (mock)
- `/dashboard/ai-articles` — AI-черновики статей (mock)
- `/dashboard/coverage` — зоны обслуживания (mock)
- `/dashboard/settings` — настройки

### Портал клиента (Task 145, частично)
- `/customer` — вход в портал
- `/customer/dashboard`, `/customer/repairs/[id]`
- `/customer/choose-technician`, `/customer/booking-confirmation`
- `/customer/price-prediction`, `/customer/diagnosis-preview`

### Dev/internal
- `/dashboard/dev/supabase-check` — диагностика auth
- `/dashboard/dev/scheduling-engine` — тест движка расписания

---

## Supabase — что применено

| Миграция | Статус |
|----------|--------|
| `0007–0010` onboarding + RLS | ✅ применено |
| `0011` company_members RLS patch | ✅ применено |
| `0013` technician profile update RPC | ⚠️ требует ручного SQL Editor |
| `0014` technician onboarding upsert RPC | ⚠️ требует ручного SQL Editor |
| `0015–0016` public technician profiles view | ✅ применено |
| `0017` service_requests table | ✅ применено |
| `0018–0019` dashboard reads + status RPC | ✅ применено |
| `0020` notes/timeline | применено (по docs) |
| `0035` customer marketplace tables | ✅ применено |
| `0036` customer self-read | ✅ применено |

---

## Что реально работает (с Supabase)

- Supabase Auth (email/password), подтверждение email
- Загрузка роли (`technician` / `admin` / `owner`) из `public.profiles`
- Onboarding flow с server actions и RLS
- Защищённый роутинг дашборда через `evaluateDashboardAccess()`
- Публичные профили техников (`public.public_technician_profiles` view)
- Создание заявок на ремонт (`service_requests`) с привязкой к клиенту
- CRM инбокс: реальные заявки, смена статуса, внутренние заметки, timeline
- Профиль техника: редактирование через RPC
- Таблицы клиентов: `customers`, `customer_appliances`, `link_current_customer_account_rpc`

---

## Что на моке / не реализовано

### UI-only (mock-данные в `src/data/`)
- Open Job Board, аналитика, расписание, сообщество, репутация
- AI-advisor, части search, inventory, вендоры

### Интеграции — нет ни одной реальной
- ❌ Google Calendar / Apple Calendar / Outlook
- ❌ Twilio / Telnyx / Retell (звонки, SMS)
- ❌ Stripe (оплата)
- ❌ Google Analytics / Search Console / Business Profile
- ❌ Zapier / Make.com
- ❌ AI-генерация статей (есть contracts, нет имплементации)
- ❌ Перевод (i18n)

### Backend
- `/backend` пуст — нет отдельного API-сервера
- Все операции идут через Next.js Route Handlers (`/app/api/`) + Supabase
- Scheduling-движок написан (pure TypeScript), но нет реального календарного провайдера

### Бизнес-процессы не закрыты
- Инвойсинг: foundation есть (`/api/invoices/[id]`), UI неполон
- Dispatch/назначение техника: нет
- Real-time (чат, уведомления): нет
- Фото-аплоады: infrastructure есть, Supabase Storage не подключён
- Customer portal: маршруты созданы (Task 145), но email-подтверждение Auth блокирует полное QA

---

## Ключевые файлы для навигации

| Файл | Назначение |
|------|-----------|
| `docs/DEVELOPER_HANDOFF.md` | полная история задач 68–145+ |
| `docs/ARCHITECTURE.md` | архитектурный обзор |
| `frontend/src/config/dashboard-navigation.ts` | навигация дашборда |
| `frontend/src/lib/integrations/registry.ts` | точка подключения провайдеров |
| `frontend/src/lib/integrations/scheduling/availability-engine.ts` | движок расписания |
| `frontend/src/server/onboarding/` | server actions онбординга |
| `supabase/migrations/` | история схемы БД |
| `WRA Platform Bible/` | продуктовые доки (.docx) |

---

## Следующие приоритеты (по логике проекта)

1. **Применить `0013`, `0014` миграции** — разблокирует сохранение профиля техника
2. **Подтвердить dev-аккаунт клиента** — разблокирует полное QA customer portal
3. **Подключить первый real провайдер** — Google Calendar или Stripe (есть contracts)
4. **Инвойсинг UI** — foundation в `/api/estimates/[id]/invoice` готов
5. **Supabase Storage** — для фото заявок (инфраструктура есть, bucket не настроен)
6. **Dispatch** — назначение техника на заявку (в архитектуре не реализовано)
