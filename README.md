# Voice Finance Agent (starter)

Голосовой личный бухгалтер поверх mini-CRM.

## Что это

Стартовый каркас backend-сервиса, который:

- поднимает Express-сервер на TypeScript;
- использует Prisma для доступа к БД;
- содержит модель `FinanceTransaction` для учёта личных расходов;
- имеет базовые маршруты:
  - `GET /api/health` — проверка работоспособности;
  - `GET /api/finance/transactions` — заглушка для списка транзакций;
  - `GET /api/finance/summary` — заглушка для сводки расходов.

Дальше сюда будут добавлены:

- `POST /api/finance/transactions` — создание транзакций;
- `POST /api/finance/parse-text` — парсер текстовых фраз в транзакции (LLM);
- `POST /api/finance/voice` — голосовой ввод через Whisper;
- `POST /api/finance/assistant` — диалоговый ИИ-бухгалтер.

## Быстрый старт

1. Установить зависимости:

   ```bash
   npm install
   ```

2. Создать `.env` на основе `.env.example` и прописать:

   - `DATABASE_URL`
   - `OPENAI_API_KEY` (позже, когда будем подключать LLM)
   - `PORT` (по умолчанию 4001)

3. Сгенерировать Prisma Client и прогнать первую миграцию:

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init_finance
   ```

4. Запустить dev-сервер:

   ```bash
   npm run dev
   ```

После этого будет доступен:

- `GET http://localhost:4001/api/health`
- `GET http://localhost:4001/api/finance/transactions`
- `GET http://localhost:4001/api/finance/summary`
