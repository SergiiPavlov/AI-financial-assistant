# Voice Finance Agent (starter)

Голосовой личный бухгалтер поверх mini-CRM. Сервис поднимает Express-сервер на TypeScript, использует Prisma и работает с реальными транзакциями: парсинг текста и голоса, сохранение, аналитика и ассистент.

## Возможности

- Express + TypeScript backend c Prisma и моделью `FinanceTransaction`.
- JWT-аутентификация (демо-логин по кнопке `Login`, email опционален).
- Рабочие маршруты:
  - `/api/health` — проверка статуса;
  - `/api/auth/demo-login`, `/api/auth/refresh`, `/api/auth/logout`;
  - `/api/finance/parse-text`, `/api/finance/voice`, `/api/finance/assistant`;
- `/api/finance/transactions` (CRUD);
- `/api/finance/summary` (агрегация по датам/категориям);
- `/api/finance/meta/categories?lang=ru|uk|en` (локализованные категории из `src/lib/categories.ts`).
- `/api/finance/transactions/export?from=YYYY-MM-DD&to=YYYY-MM-DD&category=&lang=` — CSV-экспорт транзакций текущего пользователя (требует Authorization: Bearer). Ограничение: до 20 000 строк на выгрузку.

## Data model

`FinanceTransaction` хранит как расходы, так и доходы (enum `TransactionType`):

- `type`: `expense` (по умолчанию) или `income`;
- `date`: дата операции;
- `amount`: число (>0);
- `currency`: строка, по умолчанию `UAH`;
- `category`: строковый идентификатор категории;
- `description`: описание операции;
- `source`: `manual`/`voice`/`import` и др.

Примеры ответов API:

- `/api/finance/summary?from=2025-12-01&to=2025-12-31&type=all&groupBy=both` →

  ```json
  {
    "period": { "from": "2025-12-01", "to": "2025-12-31" },
    "incomeTotal": 50000,
    "expenseTotal": 32000,
    "balance": 18000,
    "byCategory": [
      { "category": "food", "amount": 12000 },
      { "category": "other", "amount": 50000 }
    ],
    "byDate": [
      { "date": "2025-12-10", "amount": 4500 },
      { "date": "2025-12-11", "amount": 8000 }
    ]
  }
  ```

- `/api/finance/transactions/export?from=2025-12-01&to=2025-12-31&type=income` → CSV со строками вида:

  ```csv
  "date","type","categoryId","categoryLabel","amount","currency","description","source"
  "2025-12-05","income","other","Другое","50000","UAH","оклад","manual"
  ```

## Быстрый старт

1. Установить зависимости:

   ```bash
   npm ci
   ```

2. Создать `.env` на основе `.env.example` и прописать:

   - `DATABASE_URL`
   - `AUTH_JWT_SECRET` и `AUTH_REFRESH_SECRET` (рандомные строки 32+ байт)
   - `PORT` (по умолчанию 4001)
   - `OPENAI_API_KEY` (опционально для LLM)

3. Сгенерировать Prisma Client и прогнать миграции:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. Запустить сервер:

   ```bash
   npm run dev   # или
   npm run build && npm start
   ```

5. Открыть демо-страницу:

   ```text
   http://localhost:4001/demo.html
   ```

   Поток работы:

   - Нажать **Login** (email можно оставить пустым) — сервис выдаст JWT для `demo_user`.
   - В блоке «Парсинг текста» отправить фразу вроде `Сегодня 300 на продукты и 200 на такси` через **Отправить /parse-text**.
   - Нажать **Сохранить транзакции**, затем **Загрузить /transactions** для просмотра.
   - В блоке «Сводка» задать период и нажать **Получить summary** — появятся таблицы по датам и категориям.
   - При необходимости выгрузить CSV — задать период/фильтр, нажать **Экспорт CSV** в разделе «Транзакции» (фронт делает авторизованный `fetch` и скачивает файл).
   - В блоке «Вопрос ассистенту» задать вопрос и получить ответ по вашим данным.

## Переменные окружения

Минимальный набор для работы сервера:

- `DATABASE_URL` — строка подключения к PostgreSQL;
- `AUTH_JWT_SECRET` — секрет для подписи access-токенов (HS256, 32+ байт);
- `AUTH_REFRESH_SECRET` — секрет для refresh-токенов (HS256, 32+ байт);
- `PORT` — порт HTTP-сервера (по умолчанию `4001`).

Рекомендуемые настройки:

- `CORS_ORIGIN` — домен фронтенда, если он на другом origin;
- `COOKIE_SECURE` — `true` в production, `false` в dev для http;
- `ALLOW_BODY_USERID` — временный флаг для ручных запросов без JWT.

Сгенерировать секреты удобно так:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Мини sanity-тест аутентификации (после настройки `.env` и запуска сервера):

- `POST /api/auth/demo-login` → получить access/refresh токены;
- `POST /api/auth/refresh` → убедиться, что refresh работает;
- `POST /api/auth/logout` → токены становятся невалидными (`tokenVersion` инкрементится);
- повторный `POST /api/auth/refresh` после logout должен вернуть `401`.

## Использование как мини-продукта

1. Запусти сервер локально и открой `http://localhost:4001/demo.html`.
2. Нажми «Login» — появится сообщение о полученном токене для `demo_user`.
3. В блоке «Парсинг текста» отправь фразу, сохрани транзакции и посмотри их в «Транзакции».
4. В блоке «Сводка» выбери период и получи суммы по категориям/датам.
5. В блоке «Вопрос ассистенту» задай вопрос, например «Сколько потратил на еду в этом месяце?», и получи ответ.

Интерфейс демо-страницы поддерживает три языка (RU / UK / EN) для подписей и названий категорий; сами данные (описания, вопросы) могут быть любыми.
