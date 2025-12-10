import { Router } from "express";
import { callChatModel, MissingApiKeyError } from "../lib/llmClient";
import { transcribeAudio } from "../lib/whisperClient";
import { createTransactions, getSummary } from "../services/financeService";

export const financeAiRouter = Router();

type ParsedTransaction = {
  date: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  source?: string;
};

type ParseTextResult = {
  userId: string;
  recognizedText: string;
  transactions: ParsedTransaction[];
  warnings: string[];
  questions: string[];
};

const allowedCategories = [
  "food",
  "transport",
  "bills",
  "rent",
  "health",
  "fun",
  "shopping",
  "other"
];

const buildParserSystemPrompt = (todayIso: string) => `Ты — финансовый парсер. Всегда отвечай ТОЛЬКО валидным JSON без пояснений.
Схема ответа:
{
  "userId": "строка",
  "recognizedText": "оригинальный текст",
  "transactions": [
    { "date": "YYYY-MM-DD", "amount": число, "currency": "UAH", "category": "food|transport|bills|rent|health|fun|shopping|other", "description": "кратко", "source": "voice|manual|import" }
  ],
  "warnings": ["строки"],
  "questions": ["строки"]
}
Даты: если нет конкретной даты, используй сегодняшнюю (${todayIso}). Поддерживай фразы "сегодня", "вчера", "на выходных" (для выходных выбери ближайшие прошедшие выходные).
Не выдумывай транзакции, используй только то, что есть в тексте. Если категория не ясна — используй "other" и добавь пояснение в warnings.`;

const safeJsonParse = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch (error) {
    return undefined;
  }
};

const parseTransactionsWithLLM = async (userId: string, text: string): Promise<ParseTextResult> => {
  const today = new Date();
  const todayIso = today.toISOString().split("T")[0];
  const systemPrompt = buildParserSystemPrompt(todayIso);
  const response = await callChatModel({ systemPrompt, userPrompt: text });
  const parsed = safeJsonParse(response);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM returned non-JSON response");
  }

  const transactions: ParsedTransaction[] = Array.isArray(parsed.transactions)
    ? parsed.transactions
        .filter((t: any) => t && typeof t === "object")
        .map((t: any) => ({
          date: typeof t.date === "string" ? t.date : todayIso,
          amount: Number(t.amount) || 0,
          currency: typeof t.currency === "string" ? t.currency : "UAH",
          category: allowedCategories.includes(t.category) ? t.category : "other",
          description: typeof t.description === "string" ? t.description : "",
          source: typeof t.source === "string" ? t.source : "voice"
        }))
    : [];

  return {
    userId,
    recognizedText: parsed.recognizedText || text,
    transactions,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : []
  };
};

financeAiRouter.post("/parse-text", async (req, res, next) => {
  const start = Date.now();
  try {
    const { userId, text } = req.body || {};
    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const result = await parseTransactionsWithLLM(userId, text);
    console.log(
      `[finance][parse-text] user=${userId} textLength=${text.length} durationMs=${Date.now() - start} status=success transactions=${result.transactions.length}`
    );
    res.json(result);
  } catch (error) {
    console.log(
      `[finance][parse-text] user=${req.body?.userId} textLength=${req.body?.text?.length || 0} durationMs=${Date.now() - start} status=error message=${(error as Error).message}`
    );
    if (error instanceof MissingApiKeyError) {
      return res.status(503).json({ error: error.message });
    }
    next(error);
  }
});

const parseMultipartForm = async (req: any) => {
  const contentType = req.headers["content-type"] as string | undefined;
  if (!contentType || !contentType.includes("multipart/form-data")) {
    throw new Error("Content-Type must be multipart/form-data");
  }
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    throw new Error("Boundary not found in Content-Type");
  }
  const boundary = boundaryMatch[1];

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve());
    req.on("error", (err: Error) => reject(err));
  });

  const bodyBuffer = Buffer.concat(chunks);
  const rawBody = bodyBuffer.toString("latin1");
  const parts = rawBody.split(`--${boundary}`);

  const fields: Record<string, string> = {};
  const files: { fileName: string; mimeType?: string; data: Buffer }[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "--") continue;
    const [headerSection, ...rest] = trimmed.split("\r\n\r\n");
    const bodyContent = rest.join("\r\n\r\n");
    if (!headerSection || !bodyContent) continue;

    const headers = headerSection.split("\r\n");
    const disposition = headers.find((h) => h.toLowerCase().startsWith("content-disposition"));
    if (!disposition) continue;

    const nameMatch = disposition.match(/name="([^"]+)"/);
    const fileNameMatch = disposition.match(/filename="([^"]*)"/);
    const contentTypeHeader = headers.find((h) => h.toLowerCase().startsWith("content-type"));
    const mimeMatch = contentTypeHeader ? contentTypeHeader.split(":")[1]?.trim() : undefined;

    const contentBuffer = Buffer.from(bodyContent.replace(/\r\n$/, ""), "latin1");

    if (fileNameMatch && fileNameMatch[1]) {
      files.push({ fileName: fileNameMatch[1] || "upload.bin", mimeType: mimeMatch, data: contentBuffer });
    } else if (nameMatch && nameMatch[1]) {
      fields[nameMatch[1]] = bodyContent.trim();
    }
  }

  return { fields, files };
};

financeAiRouter.post("/voice", async (req, res, next) => {
  const start = Date.now();
  try {
    const { fields, files } = await parseMultipartForm(req);
    const userId = fields["userId"] || fields["userid"];
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const file = files[0];
    if (!file) {
      return res.status(400).json({ error: "Audio file is required in 'file' field" });
    }

    const transcription = await transcribeAudio(file.data, file.fileName, file.mimeType);
    const parsed = await parseTransactionsWithLLM(userId, transcription.text);
    console.log(
      `[finance][voice] user=${userId} textLength=${transcription.text.length} durationMs=${Date.now() - start} status=success transactions=${parsed.transactions.length}`
    );
    res.json(parsed);
  } catch (error) {
    console.log(
      `[finance][voice] user=${(req as any)?.body?.userId || "unknown"} durationMs=${Date.now() - start} status=error message=${(error as Error).message}`
    );
    if (error instanceof MissingApiKeyError) {
      return res.status(503).json({ error: error.message });
    }
    if (error instanceof Error && error.message.includes("Whisper")) {
      return res.status(502).json({ error: error.message });
    }
    next(error);
  }
});

type AssistantInterpretation = {
  intent: "total" | "category" | "biggestCategory";
  category: string | null;
  period: { from: string; to: string };
};

const interpretAssistantQuestion = async (message: string): Promise<AssistantInterpretation> => {
  const today = new Date();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .split("T")[0];
  const defaultTo = today.toISOString().split("T")[0];

  const systemPrompt = `Ты — финансовый помощник. Верни строго JSON без пояснений по схеме {"intent":"total|category|biggestCategory","category":"food|transport|bills|rent|health|fun|shopping|other|null","period":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}}.
Интенты:
- "total" — запрос про все расходы без фокуса на категории.
- "category" — запрос про конкретную категорию.
- "biggestCategory" — запрос про самую затратную категорию.

Категории и триггеры:
food: ["еда", "продукты", "супермаркет", "магазин", "food", "restaurant", "кафе", "ресторан"]
transport: ["такси", "транспорт", "метро", "автобус", "поезд", "самолет", "uber", "bolt"]
bills: ["коммуналка", "счета", "услуги", "интернет", "свет", "вода", "газ"]
rent: ["аренда", "квартира", "дом", "rent"]
health: ["здоровье", "лекарства", "аптека", "медицина", "doctor"]
fun: ["развлечения", "кино", "театр", "игры", "бар", "вечеринка"]
shopping: ["покупки", "одежда", "shopping", "магазин одежды", "техника"]
other: любые прочие расходы.

Правила:
- Если в вопросе явно названа категория или слово-триггер, обязательно возвращай intent: "category" и нормализованную category.
- intent: "total" допустим только если пользователь спрашивает про все расходы целиком ("сколько всего потратил", "общая сумма" и т.п.).
- Если категория не указана — ставь null. Если период не указан — возьми с ${defaultFrom} по ${defaultTo}.
- Возвращай только JSON без текста вокруг.`;
  const response = await callChatModel({ systemPrompt, userPrompt: message });
  const parsed = safeJsonParse(response);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Assistant interpretation failed");
  }
  const intent: AssistantInterpretation["intent"] =
    parsed.intent === "category" || parsed.intent === "biggestCategory" ? parsed.intent : "total";
  const category = typeof parsed.category === "string" && allowedCategories.includes(parsed.category)
    ? parsed.category
    : null;
  const periodFrom = typeof parsed?.period?.from === "string" ? parsed.period.from : defaultFrom;
  const periodTo = typeof parsed?.period?.to === "string" ? parsed.period.to : defaultTo;
  if (category && intent === "total") {
    return {
      intent: "category",
      category,
      period: { from: periodFrom, to: periodTo }
    };
  }
  return {
    intent,
    category,
    period: { from: periodFrom, to: periodTo }
  };
};

financeAiRouter.post("/assistant", async (req, res, next) => {
  const start = Date.now();
  try {
    const { userId, message } = req.body || {};
    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const interpretation = await interpretAssistantQuestion(message);
    console.log(
      `[finance][assistant] user=${userId} textLength=${message.length} durationMs=${Date.now() - start} status=interpreted intent=${interpretation.intent}`
    );
    const summary = await getSummary({
      userId,
      from: new Date(interpretation.period.from),
      to: new Date(interpretation.period.to),
      groupBy: "both"
    });

    let amount = summary.total;
    let total = summary.total;
    let categoryAmount: number | undefined;

    if (interpretation.intent === "category") {
      categoryAmount = summary.byCategory.find((c) => c.category === interpretation.category)?.amount || 0;
      amount = categoryAmount;
    }

    if (interpretation.intent === "biggestCategory") {
      const biggest = summary.byCategory.reduce(
        (acc, curr) => (curr.amount > acc.amount ? curr : acc),
        { category: "", amount: 0 }
      );
      interpretation.category = biggest.category || null;
      categoryAmount = biggest.amount;
      amount = biggest.amount;
    }

    const share = total > 0 ? Number((amount / total).toFixed(2)) : 0;
    const categoryLabel = interpretation.category || "все категории";
    let answer: string;

    if (interpretation.intent === "category") {
      const percent = (share * 100).toFixed(1);
      answer = `За период с ${summary.period.from} по ${summary.period.to} по категории ${categoryLabel} сумма расходов составила ${amount}. Это ${percent}% от общей суммы ${total}.`;
    } else if (interpretation.intent === "biggestCategory") {
      const percent = (share * 100).toFixed(1);
      answer = `Самая затратная категория за период с ${summary.period.from} по ${summary.period.to} — ${categoryLabel} с суммой ${amount} (${percent}% от всех расходов).`;
    } else {
      answer = `За период с ${summary.period.from} по ${summary.period.to} общая сумма расходов составила ${total}.`;
    }

    res.json({
      userId,
      question: message,
      answer,
      details: {
        period: summary.period,
        category: interpretation.category,
        amount,
        total,
        share
      }
    });
  } catch (error) {
    console.log(
      `[finance][assistant] user=${req.body?.userId} textLength=${req.body?.message?.length || 0} durationMs=${Date.now() - start} status=error message=${(error as Error).message}`
    );
    if (error instanceof MissingApiKeyError) {
      return res.status(503).json({ error: error.message });
    }
    next(error);
  }
});

financeAiRouter.post("/parse-and-save", async (req, res, next) => {
  try {
    const { userId, text } = req.body || {};
    if (!userId || !text) {
      return res.status(400).json({ error: "userId and text are required" });
    }
    const parsed = await parseTransactionsWithLLM(userId, text);
    const created = await createTransactions(
      parsed.transactions.map((t) => ({
        userId,
        date: new Date(t.date),
        amount: t.amount,
        currency: t.currency,
        category: t.category,
        description: t.description,
        source: t.source || "voice"
      }))
    );
    res.status(201).json({ ...parsed, transactions: created });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return res.status(503).json({ error: error.message });
    }
    next(error);
  }
});

export { parseTransactionsWithLLM };
