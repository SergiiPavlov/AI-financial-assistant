import { Router } from "express";
import { callChatModel, MissingApiKeyError } from "../lib/llmClient";
import { transcribeAudio } from "../lib/whisperClient";
import { createTransactions, getSummary } from "../services/financeService";
import { CATEGORY_IDS, normalizeCategoryId, getCategoryLabel, isCategoryId } from "../lib/categories";

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


const buildParserSystemPrompt = (todayIso: string) => {
  const categoriesList = CATEGORY_IDS.join("|");
  return `Ты — финансовый парсер. Пользователь может говорить по-русски, по-украински или по-английски.
Всегда отвечай ТОЛЬКО валидным JSON без пояснений.

Схема ответа:
{
  "userId": "строка",
  "recognizedText": "оригинальный текст (как есть)",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amount": число,
      "currency": "UAH",
      "category": "${categoriesList}",
      "description": "кратко",
      "source": "voice|manual|import"
    }
  ],
  "warnings": ["строки"],
  "questions": ["строки"]
}

Требования:
- userId НЕ выдумывай, используй тот, что передан отдельно (НЕ из текста).
- "transactions" — массив реальных операций из текста. Не добавляй ничего, чего в тексте нет.
- "date":
  - если дата явно указана — используй её;
  - если сказано "сегодня" — используй "${todayIso}";
  - если дата не указана — тоже используй "${todayIso}".
- "amount" — только числа; игнорируй слова без суммы.
- "currency":
  - если в тексте явно названа валюта (UAH/грн/₴, USD/$, EUR/€ и т.п.) — поставь код валюты "UAH" | "USD" | "EUR";
  - если валюта не указана, оставь поле "currency" пустой строкой "" (не придумывай валюту сам).
- "category":
  - всегда одно из: ${categoriesList};
  - если не уверен — используй "other" и добавь пояснение в "warnings".
- "description" — коротко по-русски или по-украински, что это за трата.
- "source":
  - "voice" для голосового ввода,
  - "manual" для текстового ввода,
  - "import" для данных из других систем.

Если часть фразы непонятна — не придумывай сумму, лучше добавь вопрос в "questions".`;
};

const safeJsonParse = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch (error) {
    return undefined;
  }
};


const normalizeCurrencyCode = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  if (lower.includes("uah") || lower.includes("грн") || lower.includes("грив")) {
    return "UAH";
  }
  if (lower.includes("usd") || lower.includes("доллар") || lower.includes("бакс") || text.includes("$")) {
    return "USD";
  }
  if (lower.includes("eur") || lower.includes("евро") || text.includes("€")) {
    return "EUR";
  }

  // Already a clean code like "UAH" / "USD" / "EUR"
  if (text === "UAH" || text === "USD" || text === "EUR") {
    return text;
  }

  return null;
};


const applyCurrencyDefaults = (
  transactions: ParsedTransaction[],
  originalText?: string
): { transactions: ParsedTransaction[]; warnings: string[] } => {
  const warnings: string[] = [];
  let lastCurrency: string | null = null;

  const normalized = transactions.map((tx, index) => {
    let currency = normalizeCurrencyCode(tx.currency);

    if (currency) {
      // Явно указанная валюта в ответе модели
      lastCurrency = currency;
    } else if (lastCurrency) {
      // Явная "пустая" валюта — наследуем последнюю и фиксируем предупреждение
      currency = lastCurrency;
      warnings.push(
        `В транзакции #${index + 1} сумма ${tx.amount} унаследовала валюту ${currency} из предыдущей операции.`
      );
    } else {
      // Вообще нигде не было валюты — используем базовую UAH
      currency = "UAH";
      warnings.push(
        `В транзакции #${index + 1} сумма ${tx.amount} без указанной валюты — использована валюта по умолчанию UAH.`
      );
    }

    return { ...tx, currency };
  });

  // Дополнительное мягкое предупреждение: если в тексте валюта упомянута
  // реже, чем количество сумм, значит часть операций опирается на контекст.
  if (originalText && normalized.length > 1) {
    const lower = originalText.toLowerCase();
    const currencyTokens = [
      "uah",
      "грн",
      "грив",
      "₴",
      "usd",
      "доллар",
      "дол.",
      "$",
      "eur",
      "euro",
      "евро",
      "€",
      "pln",
      "zł",
      "злот",
      "gbp",
      "фунт",
      "£"
    ];

    let explicitMentions = 0;
    for (const token of currencyTokens) {
      let idx = lower.indexOf(token);
      while (idx !== -1) {
        explicitMentions += 1;
        idx = lower.indexOf(token, idx + token.length);
      }
    }

    if (explicitMentions > 0 && explicitMentions < normalized.length) {
      warnings.push(
        "В этой фразе валюта явно указана не для всех сумм — для части операций использована валюта по контексту (как у соседних сумм). Проверьте, всё ли верно."
      );
    }
  }

  return { transactions: normalized, warnings };
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

  const rawTransactions: ParsedTransaction[] = Array.isArray(parsed.transactions)
    ? parsed.transactions
        .filter((t: any) => t && typeof t === "object")
        .map((t: any) => ({
          date: typeof t.date === "string" ? t.date : todayIso,
          amount: Number(t.amount) || 0,
          currency: typeof t.currency === "string" ? t.currency : "",
          category: normalizeCategoryId(t.category),
          description: typeof t.description === "string" ? t.description : "",
          source: typeof t.source === "string" ? t.source : "voice"
        }))
    : [];

  const { transactions, warnings: currencyWarnings } = applyCurrencyDefaults(rawTransactions, text);

  return {
    userId,
    recognizedText: parsed.recognizedText || text,
    transactions,
    warnings: [
      ...(Array.isArray(parsed.warnings) ? parsed.warnings : []),
      ...currencyWarnings
    ],
    questions: Array.isArray(parsed.questions) ? parsed.questions : []
  };
};

financeAiRouter.post("/parse-text", async (req, res, next) => {
  try {
    const { userId, text } = req.body || {};
    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const result = await parseTransactionsWithLLM(userId, text);
    res.json(result);
  } catch (error) {
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
    res.json(parsed);
  } catch (error) {
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



const addDaysUtc = (date: Date, days: number): Date => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const startOfIsoWeek = (date: Date): Date => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday -> 7
  const diff = day - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
};

const detectWeekdayFromText = (lower: string): number | null => {
  if (
    lower.includes("понедельник") ||
    lower.includes("понеділок") ||
    lower.includes("monday")
  ) {
    return 1;
  }
  if (
    lower.includes("вторник") ||
    lower.includes("вiвторок") ||
    lower.includes("вівторок") ||
    lower.includes("tuesday")
  ) {
    return 2;
  }
  if (
    lower.includes("среда") ||
    lower.includes("середа") ||
    lower.includes("wednesday")
  ) {
    return 3;
  }
  if (
    lower.includes("четверг") ||
    lower.includes("четвер") ||
    lower.includes("thursday")
  ) {
    return 4;
  }
  if (
    lower.includes("пятница") ||
    lower.includes("пʼятниця") ||
    lower.includes("пятницю") ||
    lower.includes("п'ятниця") ||
    lower.includes("friday")
  ) {
    return 5;
  }
  if (
    lower.includes("суббота") ||
    lower.includes("субота") ||
    lower.includes("saturday")
  ) {
    return 6;
  }
  if (
    lower.includes("воскресенье") ||
    lower.includes("неділя") ||
    lower.includes("sunday")
  ) {
    return 7;
  }
  return null;
};

const interpretAssistantQuestion = async (message: string): Promise<AssistantInterpretation> => {
  const today = new Date();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .split("T")[0];
  const defaultTo = today.toISOString().split("T")[0];


  const lower = message.toLowerCase();
  const hasTodayWord = lower.includes("сегодня") || lower.includes("сьогодні") || lower.includes("today");
  const hasYesterdayWord = lower.includes("вчера") || lower.includes("вчора") || lower.includes("yesterday");
  const hasDayBeforeYesterdayWord =
    lower.includes("позавчера") ||
    lower.includes("позавчора") ||
    lower.includes("day before yesterday");
  const hasLastWeekWord =
    ((lower.includes("прошл") || lower.includes("минул")) && (lower.includes("недел") || lower.includes("тиж"))) ||
    lower.includes("last week") ||
    lower.includes("previous week");
  const hasThisWeekWord =
    lower.includes("эта недел") ||
    lower.includes("этой недел") ||
    lower.includes("ця неділ") ||
    lower.includes("цей тиж") ||
    lower.includes("цього тиж") ||
    lower.includes("this week") ||
    lower.includes("current week");
  const hasLastMonthWord =
    ((lower.includes("прошл") || lower.includes("минул")) &&
      (lower.includes("месяц") || lower.includes("місяц") || lower.includes("місяць"))) ||
    lower.includes("last month") ||
    lower.includes("previous month");
  const hasThisMonthWord =
    lower.includes("этот месяц") ||
    lower.includes("в этом месяце") ||
    lower.includes("цей місяць") ||
    lower.includes("цьому місяці") ||
    lower.includes("this month") ||
    lower.includes("current month");
  const hasLastYearWord =
    ((lower.includes("прошл") || lower.includes("минул")) &&
      (lower.includes("год") || lower.includes("рік") || lower.includes("рок"))) ||
    lower.includes("last year") ||
    lower.includes("previous year");
  const hasThisYearWord =
    lower.includes("этот год") ||
    lower.includes("в этом году") ||
    lower.includes("цей рік") ||
    lower.includes("цьому році") ||
    lower.includes("this year") ||
    lower.includes("current year");
  const mentionsMonth =
    lower.includes("месяц") ||
    lower.includes("місяц") ||
    lower.includes("місяць") ||
    lower.includes("month");
  const weekdayInText = detectWeekdayFromText(lower);

  const categoriesList = CATEGORY_IDS.join("|");

  const systemPrompt = `Ты — финансовый помощник. Пользователь может задавать вопросы по-русски, по-украински или по-английски.
Верни только JSON по схеме:
{
  "intent": "total" | "category" | "biggestCategory",
  "category": "food" | "transport" | "bills" | "rent" | "health" | "fun" | "shopping" | "other" | null,
  "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }
}

Пояснения:
- "intent":
  - "total" — если спрашивают об общей сумме расходов без конкретной категории;
  - "category" — если явно интересуются одной категорией (еда, їжа, продукты, транспорт, коммуналка и т.п.);
  - "biggestCategory" — если спрашивают «какая категория самая большая», «где больше всего трачу» и т.п.
- "category":
  - всегда одно из: ${'${'}categoriesList} или null;
  - используй "food" для фраз вроде "еда", "продукты", "їжа", "продукти", "food";
  - "transport" — для "транспорт", "проезд", "маршрутка", "такси", "таксі", "taxi", "transport";
  - "bills" — для коммунальных платежей, счетов за свет/газ/воду, "коммуналка", "комуналка", "utilities";
  - "rent" — для аренды жилья, "аренда квартиры", "оренда житла", "rent";
  - "health" — для аптек, лекарств, врачей, "здоровье", "здоров'я", "medicine", "health";
  - "fun" — для кино, игр, развлечений, подписок, "entertainment", "fun";
  - "shopping" — для покупок одежды, техники и другого шопинга;
  - если категория не указана или непонятна — используй null.
- "period":
  - если в вопросе есть конкретные даты — используй их;
  - если спрашивают только про "сегодня" / "today" / "сьогодні" — установи обе даты равными сегодняшней (${''}${defaultTo});
  - если спрашивают про "вчера" / "yesterday" — установи обе даты равными вчерашней дате;
  - если спрашивают про "позавчера" — установи обе даты равными дате позавчера;
  - если спрашивают про "прошлую неделю" / "на прошлой неделе" / "last week" — используй прошлую календарную неделю (с понедельника по воскресенье);
  - если спрашивают про "эту неделю" / "на этой неделе" / "this week" — используй текущую календарную неделю;
  - если спрашивают про "прошлый месяц" / "за прошлый месяц" / "last month" — выбери прошлый календарный месяц;
  - если спрашивают про "этот месяц" / "в этом месяце" / "this month" — выбери текущий календарный месяц;
  - если спрашивают про "прошлый год" / "за прошлый год" / "last year" — выбери прошлый календарный год;
  - если спрашивают про "этот год" / "в этом году" / "this year" — выбери текущий календарный год;
  - если указан месяц/год (например, "за октябрь", "for November") — выбери соответствующий период;
  - если период не указан — возьми с ${'${'}defaultFrom} по ${'${'}defaultTo}.`;

  const response = await callChatModel({ systemPrompt, userPrompt: message });
  const parsed = safeJsonParse(response);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Assistant interpretation failed");
  }
  const intent: AssistantInterpretation["intent"] =
    parsed.intent === "category" || parsed.intent === "biggestCategory" ? parsed.intent : "total";

  let category: string | null =
    typeof (parsed as any).category === "string" && (parsed as any).category
      ? normalizeCategoryId((parsed as any).category)
      : null;

  let periodFrom = typeof (parsed as any)?.period?.from === "string" ? (parsed as any).period.from : defaultFrom;
  let periodTo = typeof (parsed as any)?.period?.to === "string" ? (parsed as any).period.to : defaultTo;

  // Нормализуем период для относительных формулировок ("сегодня", "вчера", "на прошлой неделе" и т.п.)
  if (hasTodayWord && !mentionsMonth) {
    // сегодня
    periodFrom = defaultTo;
    periodTo = defaultTo;
  } else if (hasYesterdayWord && !mentionsMonth) {
    // вчера
    const yesterday = addDaysUtc(today, -1);
    const iso = yesterday.toISOString().split("T")[0];
    periodFrom = iso;
    periodTo = iso;
  } else if (hasDayBeforeYesterdayWord && !mentionsMonth) {
    // позавчера
    const dayBeforeYesterday = addDaysUtc(today, -2);
    const iso = dayBeforeYesterday.toISOString().split("T")[0];
    periodFrom = iso;
    periodTo = iso;
  } else if (hasLastWeekWord) {
    // прошлая неделя
    const thisWeekStart = startOfIsoWeek(today);
    const lastWeekStart = addDaysUtc(thisWeekStart, -7);

    if (weekdayInText) {
      // конкретный день прошлой недели, например "во вторник на прошлой неделе"
      const target = addDaysUtc(lastWeekStart, weekdayInText - 1);
      const iso = target.toISOString().split("T")[0];
      periodFrom = iso;
      periodTo = iso;
    } else {
      // вся прошлая неделя
      const lastWeekEnd = addDaysUtc(lastWeekStart, 6);
      periodFrom = lastWeekStart.toISOString().split("T")[0];
      periodTo = lastWeekEnd.toISOString().split("T")[0];
    }
  } else if (hasThisWeekWord) {
    // текущая неделя
    const thisWeekStart = startOfIsoWeek(today);

    if (weekdayInText) {
      // конкретный день этой недели, например "в понедельник на этой неделе"
      const target = addDaysUtc(thisWeekStart, weekdayInText - 1);
      const iso = target.toISOString().split("T")[0];
      periodFrom = iso;
      periodTo = iso;
    } else {
      // вся текущая неделя
      const thisWeekEnd = addDaysUtc(thisWeekStart, 6);
      periodFrom = thisWeekStart.toISOString().split("T")[0];
      periodTo = thisWeekEnd.toISOString().split("T")[0];
    }
  } else if (hasLastMonthWord) {
    // прошлый месяц (полностью)
    const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(prevMonthStart.getUTCFullYear(), prevMonthStart.getUTCMonth() + 1, 0));
    periodFrom = prevMonthStart.toISOString().split("T")[0];
    periodTo = prevMonthEnd.toISOString().split("T")[0];
  } else if (hasThisMonthWord && mentionsMonth) {
    // этот месяц (полностью)
    const thisMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const thisMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    periodFrom = thisMonthStart.toISOString().split("T")[0];
    periodTo = thisMonthEnd.toISOString().split("T")[0];
  } else if (hasLastYearWord) {
    // прошлый год (полностью)
    const prevYear = today.getUTCFullYear() - 1;
    const prevYearStart = new Date(Date.UTC(prevYear, 0, 1));
    const prevYearEnd = new Date(Date.UTC(prevYear, 11, 31));
    periodFrom = prevYearStart.toISOString().split("T")[0];
    periodTo = prevYearEnd.toISOString().split("T")[0];
  } else if (hasThisYearWord) {
    // этот год (полностью)
    const curYear = today.getUTCFullYear();
    const curYearStart = new Date(Date.UTC(curYear, 0, 1));
    const curYearEnd = new Date(Date.UTC(curYear, 11, 31));
    periodFrom = curYearStart.toISOString().split("T")[0];
    periodTo = curYearEnd.toISOString().split("T")[0];
  }

return {
    intent,
    category,
    period: { from: periodFrom, to: periodTo }
  };
};


financeAiRouter.post("/assistant", async (req, res, next) => {
  try {
    const { userId, message } = req.body || {};
    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const interpretation = await interpretAssistantQuestion(message);
    const summary = await getSummary({
      userId,
      from: new Date(interpretation.period.from),
      to: new Date(interpretation.period.to),
      groupBy: "both"
    });

    // Нормализуем намерение: если модель вернула категорию, но intent не "category",
    // и такая категория реально есть в сводке — считаем, что пользователь спрашивал именно про категорию.
    let intent = interpretation.intent;
    let category = interpretation.category;

    if (
      category &&
      summary.byCategory.some((c) => c.category === category) &&
      intent !== "category" &&
      intent !== "biggestCategory"
    ) {
      intent = "category";
    }

    let amount = summary.total;
    let categoryAmount: number | undefined;

    if (intent === "category" && category) {
      categoryAmount = summary.byCategory.find((c) => c.category === category)?.amount || 0;
      amount = categoryAmount;
    }

    if (intent === "biggestCategory") {
      const biggest = summary.byCategory.reduce(
        (acc, curr) => (curr.amount > acc.amount ? curr : acc),
        { category: "", amount: 0 }
      );
      category = biggest.category || null;
      categoryAmount = biggest.amount;
      amount = biggest.amount;
    }

    const share = summary.total > 0 ? Number((amount / summary.total).toFixed(2)) : 0;
    const categoryLabel =
      category && typeof category === "string" && isCategoryId(category)
        ? getCategoryLabel(category, "ru")
        : intent === "total"
        ? "все категории"
        : "неизвестная категория";
    const answer =
      intent === "biggestCategory"
        ? `Самая затратная категория за период с ${summary.period.from} по ${summary.period.to} — ${categoryLabel} с суммой ${amount} (${share * 100}% от всех расходов).`
        : intent === "category"
        ? `За период с ${summary.period.from} по ${summary.period.to} по категории ${categoryLabel} сумма расходов составила ${amount}.`
        : `За период с ${summary.period.from} по ${summary.period.to} общая сумма расходов по всем категориям составила ${amount}.`;

    res.json({
      userId,
      question: message,
      answer,
      details: {
        period: summary.period,
        category,
        amount,
        total: summary.total,
        share,
        intent
      }
    });
  } catch (error) {
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
