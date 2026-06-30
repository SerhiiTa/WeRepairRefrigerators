# Аудит флоу: Estimate → Deposit → Invoice → Payment

_Дата: 2026-06-17. Только чтение — никакой код не изменялся._

---

## 1. Файлы по Estimate

### API Routes
| Файл | Метод | Назначение |
|------|-------|-----------|
| `app/api/service-requests/[id]/estimates/route.ts` | `POST` | Создать/обновить estimate, вызывает RPC `create_service_request_estimate_rpc` |
| `app/api/estimates/[id]/send/route.ts` | `POST` | Отправить estimate клиенту (→ RPC `send_service_request_estimate_to_customer_rpc`), возвращает `approvalUrl` с токеном |
| `app/api/estimates/[id]/respond/route.ts` | `POST` | Клиент подтверждает/отклоняет (→ RPC `respond_to_public_estimate_rpc`), доступ без auth по токену |
| `app/api/estimates/[id]/invoice/route.ts` | `POST` | Создать invoice из approved estimate (→ RPC `create_invoice_from_estimate_rpc`) |
| `app/api/estimate-agent/draft/route.ts` | `POST` | AI-черновик estimate через OpenAI; если ключа нет — возвращает rule-based draft |

### Страницы
| Файл | Описание |
|------|---------|
| `app/estimates/[token]/page.tsx` | Публичная страница для клиента (без login) |
| `app/dashboard/leads/[id]/page.tsx` | Загружает request, рендерит `ServiceRequestDetail` |

### Компоненты
| Файл | Описание |
|------|---------|
| `components/public/PublicEstimateApproval.tsx` | Клиентский UI: смета с позициями, кнопки Approve/Decline |
| `components/dashboard/ServiceRequestDetail.tsx` | Главный dashboard-компонент (~5500+ строк): создание, редактирование, отправка сметы, просмотр ссылки, создание инвойса |

### Библиотеки
| Файл | Описание |
|------|---------|
| `lib/estimate-draft-agent.ts` | Клиентский хелпер для AI-генерации черновика |
| `lib/service-request-records.ts` | Форматирование денег, дат, статусов |

### Типы
| Файл | Описание |
|------|---------|
| `lib/supabase/types.ts` | Авто-генерированные типы из Supabase схемы |
| `types/repair-case.ts` | Упоминание estimate в контексте repair case |

### Supabase миграции (estimates)
| Миграция | Статус | Что делает |
|----------|--------|-----------|
| `0023_pricing_catalog_and_estimates_foundation` | ✅ применена | Таблица `service_request_estimates`, `pricing_catalog`, статусы: `draft/sent/approved/declined/void/presented` |
| `0024_estimate_ux_v2_fields` | ✅ применена | Поля `sent_at`, расширение статусов |
| `0025_estimate_lifecycle_rpc` | ✅ применена | RPCs send/создания estimate |
| `0026_estimate_customer_approval_flow` | ✅ применена | RPC `respond_to_public_estimate_rpc`, токен-based approval |
| `0027_estimate_token_generation_fix` | ✅ применена | Фикс генерации токена |
| `0034_job_status_lifecycle_and_estimate_transitions` | применена | Переходы статусов job ↔ estimate |
| `0042_professional_estimate_service_catalog_foundation` | **неизвестно** | Каталог услуг для estimate |
| `0043_estimate_agent_intelligence_foundation` | **неизвестно** | RPC `record_estimate_learning_event_rpc` |

**Lifecycle статусов estimate:**
```
draft → sent → approved
                      ↘ declined
              ↘ void (из draft)
```

---

## 2. Файлы по Invoice

### API Routes
| Файл | Метод | Назначение |
|------|-------|-----------|
| `app/api/estimates/[id]/invoice/route.ts` | `POST` | Создать invoice из approved estimate |
| `app/api/invoices/[id]/route.ts` | `PATCH` | Действия: `send` \| `paid` \| `void` → RPCs в Supabase |

### Компоненты
| Файл | Описание |
|------|---------|
| `components/dashboard/ServiceRequestDetail.tsx` | Список инвойсов, кнопки Send/Mark Paid/Void |
| `components/customer/CustomerDashboardShell.tsx` | Плейсхолдер "Repair invoices and payment status will appear here" |

### Supabase миграции (invoices)
| Миграция | Статус | Что делает |
|----------|--------|-----------|
| `0028_invoice_foundation` | применена (по docs) | Таблица `service_request_invoices`, RPCs: `create_invoice_from_estimate_rpc`, `send_service_request_invoice_rpc`, `mark_service_request_invoice_paid_rpc`, `void_service_request_invoice_rpc` |

**Lifecycle статусов invoice:**
```
draft → sent → paid
         ↘ void
```

> Комментарий в `0028`: _"Not an accounting ledger or payment processor."_

**Нет клиентской страницы для инвойса.** Нет `/customer/invoice/[id]` и нет `/estimates/invoice/[token]`. Клиент не может увидеть инвойс самостоятельно.

---

## 3. Stripe / Payment / Deposit

### Deposit
**Нет нигде.** Ни одного упоминания слова "deposit" в коде (кроме одного комментария в community-странице в другом контексте). Таблицы нет, поля нет, UI нет.

### Stripe
**Нет реализации.** Пакет `stripe` отсутствует в `package.json`.

Есть только **контракт** в `lib/integrations/types.ts`:
```typescript
export interface PaymentProvider {
  createCustomer(input: PaymentCustomerCreate): Promise<ProviderResult<PaymentCustomerRef>>;
  createPaymentLink(input: PaymentLinkCreate): Promise<ProviderResult<PaymentLinkRef>>;
  getPaymentStatus(input: PaymentStatusRequest): Promise<ProviderResult<PaymentStatus>>;
  voidPaymentLink(input: PaymentLinkVoid): Promise<ProviderResult<{ voided: true }>>;
  normalizeWebhook(input: ProviderWebhook): Promise<ProviderResult<PaymentEvent>>;
}
```

`registry.ts` регистрирует `noopPaymentProvider` — он возвращает ошибки на все вызовы, ничего реального не делает.

**Нет** webhook-роута для Stripe (`/api/stripe/webhook` или аналога). Нет Stripe environment variables в `.env.example`.

### "Payment" в коде
- `CustomerDashboardShell.tsx` — строка "payment status will appear here" (UI-плейсхолдер)
- `ServiceRequestFlow.tsx` — комментарий "SMS, email, payment, and customer portal access are still future"
- `lib/integrations/types.ts` — только контракт
- `lib/integrations/noop-providers.ts` — только noop без реального кода

---

## 4. Что происходит после Estimate Approved

### Со стороны клиента (публичная страница `/estimates/[token]`)

1. Клиент нажимает **Approve Estimate**
2. `POST /api/estimates/[token]/respond` → `respond_to_public_estimate_rpc` → статус → `approved`
3. Клиент видит сообщение:
   > _"Estimate approved. The technician can now schedule the next step."_
4. Страница показывает "Response recorded" с датой
5. **Всё. Дальше ничего.** Никакого редиректа, никакой кнопки оплаты, никакого email клиенту.

### Со стороны техника (дашборд `/dashboard/leads/[id]`)

1. `estimatesState` перечитывается из `service_request_estimates`
2. Если `estimate.estimateStatus === "approved"` → показывается кнопка **"Create Invoice"** (строка 3338 в `ServiceRequestDetail.tsx`)
3. Техник нажимает — `POST /api/estimates/[id]/invoice` → создаётся `service_request_invoices` запись со статусом `draft`
4. Техник видит карточку инвойса с кнопками: **Send Invoice** / **Mark Paid** / **Void**
5. "Send Invoice" → `PATCH /api/invoices/[id]` с `action: "send"` → RPC → статус `sent`
6. "Mark Paid" → `PATCH /api/invoices/[id]` с `action: "paid"` → RPC → статус `paid`

### Разрывы в цепочке

| Шаг | Состояние |
|-----|----------|
| Estimate approved → уведомление технику | ❌ нет (ни email, ни SMS, ни push) |
| Estimate approved → клиент получает ссылку на оплату | ❌ нет |
| Invoice sent → клиент получает email с инвойсом | ❌ нет (email-провайдер = noop) |
| Invoice sent → клиент может оплатить онлайн | ❌ нет |
| Invoice paid → автоматическая фиксация | ❌ нет, только ручное "Mark Paid" |
| Клиент видит свой инвойс | ❌ нет клиентской страницы инвойса |
| Deposit перед работой | ❌ не существует |

---

## 5. Итоговая карта: что есть, чего нет

### Есть (работает)
- ✅ Создание estimate с line items (catalog + custom) из дашборда
- ✅ AI-черновик estimate (rule-based fallback если нет OpenAI)
- ✅ Отправка estimate клиенту → публичная ссылка с токеном
- ✅ Клиент видит смету и нажимает Approve/Decline → статус пишется в БД
- ✅ Техник видит approved estimate и создаёт invoice вручную
- ✅ Invoice lifecycle в дашборде: draft → send → paid / void (всё вручную)
- ✅ Полный провайдер-нейтральный контракт `PaymentProvider`

### Отсутствует (не реализовано)
- ❌ **Deposit** — концепция полностью отсутствует
- ❌ **Stripe** — пакет не установлен, webhook-роута нет, env vars нет
- ❌ **Онлайн-оплата** — клиент не может заплатить через сайт
- ❌ **Email-уведомления** — noop-провайдер, письма не отправляются
- ❌ **Клиентская страница инвойса** — нет `/customer/invoice/[id]`
- ❌ **Автоматизация** — ни один переход статуса не триггерит следующий шаг
- ❌ **Customer dashboard** для estimates/invoices — только UI-плейсхолдеры

### Сломано / обрывается
- ⚠️ **Миграции `0042`, `0043`** — не подтверждено, применены ли. Без `0043` `record_estimate_learning_event_rpc` упадёт silent (try/catch в `/send/route.ts`, не блокирует)
- ⚠️ После "Approve" клиент видит пустой экран без CTA — dead end для пользователя
- ⚠️ "Send Invoice" только меняет статус в БД; реального отправления письма нет — клиент никогда не узнает об инвойсе
- ⚠️ Customer dashboard `/customer/dashboard` показывает "Estimates & invoices" секцию с плейсхолдерами — данные не загружаются

---

## Что нужно для полного флоу

1. **Stripe**: установить пакет, добавить env vars, реализовать `StripePaymentProvider`, добавить webhook-роут `/api/stripe/webhook`
2. **Payment link на invoice**: при "Send Invoice" создавать Stripe Payment Link и включать в письмо
3. **Email**: реализовать email-провайдер (Resend / SendGrid) — уведомление после approve и при отправке инвойса
4. **Deposit**: добавить поле `deposit_amount` / `deposit_paid_at` на invoice или отдельную таблицу; Stripe Checkout в две транзакции
5. **Customer invoice page**: `/customer/invoice/[token]` — клиент видит инвойс и кнопку Pay
6. **Автоматизация**: после `approved` → auto-create invoice draft + notify техника
