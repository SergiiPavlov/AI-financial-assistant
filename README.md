# Voice Finance Agent

Голосовой личный бухгалтер поверх mini-CRM: API на Node.js 20 + TypeScript + Express + Prisma.

## Быстрый старт

1. Установить зависимости:

   ```bash
   npm install
   ```

2. Создать `.env` на основе `.env.example` и указать:

   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `AUTH_JWT_SECRET`
   - `PORT` (по умолчанию 4001)

3. Сгенерировать Prisma Client и применить миграции:

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init_finance
   ```

4. Запустить dev-сервер:

   ```bash
   npm run dev
   ```

## Основные эндпоинты

- `GET /api/health` — проверка работоспособности.
- `GET /api/finance/transactions` — список транзакций c пагинацией (query: `userId`, `from`, `to`, `category`, `page`, `limit`).
- `POST /api/finance/transactions` — пакетное создание транзакций `{ items: [{ userId, date, amount, currency?, category, description, source? }] }`.
- `GET /api/finance/summary` — агрегированная сводка по периоду (query: `userId`, `from`, `to`, `groupBy=category|date|both`).
- `POST /api/finance/parse-text` — разбирает произвольный текст в набор транзакций через LLM.
- `POST /api/finance/voice` — принимает аудио (multipart/form-data, поле `file`), транскрибирует и парсит транзакции.
- `POST /api/finance/assistant` — диалоговый ИИ, отвечает на вопросы о расходах.

Все финансовые эндпоинты ожидают JWT в заголовке `Authorization: Bearer <token>`. В payload токена должен быть `id` или `sub` с идентификатором пользователя. Для ручных тестов временно поддерживается передача `userId` в теле, но это поведение будет убрано.

### Примеры запросов

- **Парсинг текста**

  ```bash
  curl -X POST http://localhost:4001/api/finance/parse-text \
    -H "Content-Type: application/json" \
    -d '{"userId":"demo","text":"Сегодня 300 на продукты и 200 на такси"}'
  ```

- **Сохранение транзакций**

  ```bash
  curl -X POST http://localhost:4001/api/finance/transactions \
    -H "Content-Type: application/json" \
    -d '{"items":[{"userId":"demo","date":"2025-01-10","amount":300,"currency":"UAH","category":"food","description":"продукты"}]}'
  ```

- **Сводка расходов**

  ```bash
  curl "http://localhost:4001/api/finance/summary?userId=demo&from=2025-01-01&to=2025-01-31&groupBy=both"
  ```

- **Вопрос ассистенту**

  ```bash
  curl -X POST http://localhost:4001/api/finance/assistant \
    -H "Content-Type: application/json" \
    -d '{"userId":"demo","message":"Сколько потратил на еду в этом месяце?"}'
  ```

### Демо-страница

Открыть `public/demo.html` в браузере (или через статическую раздачу) и:

1. Нажать «Получить demo-токен» — сервис вернёт тестовый JWT и подставит его в последующие запросы.
2. Нажать «Отправить /parse-text» — появится JSON с распознанными транзакциями.
3. Кнопка «Сохранить транзакции» отправит их в `/api/finance/transactions`. Повторное сохранение того же результата блокируется на уровне UI.
4. Блоки ниже позволяют запросить список транзакций, сводку и задать вопрос ассистенту.

Поле `userId` в форме оставлено для отладки/override, но в стандартном сценарии идентификатор берётся из JWT.

## Логирование

Эндпоинты `/api/finance/parse-text`, `/api/finance/voice` и `/api/finance/assistant` пишут в консоль ключевые события: `userId`, длина текста или количество транзакций, длительность LLM-вызова и статус (success/error).

## Integration notes

- Поле `userId` передаётся строкой и воспринимается как внешний идентификатор пользователя.
- В боевой интеграции токен приходит от mini-CRM: `Authorization: Bearer <jwt>`.
- В payload JWT ожидается `id` или `sub` с идентификатором пользователя mini-CRM; вся аналитика строится по нему.
- Передача `userId` в теле запросов поддерживается только как временный fallback для ручных тестов.
