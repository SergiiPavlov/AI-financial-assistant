import { Router } from "express";
import {
  createTransactions,
  deleteTransaction,
  getTransactionsForExport,
  listTransactions,
  updateTransaction,
  TransactionForExport,
  TransactionInput
} from "../services/financeService";
import { requireAuth } from "../lib/auth";
import { config } from "../config/env";
import { getCategoryLabel, Lang } from "../lib/categories";

export const financeTransactionsRouter = Router();
financeTransactionsRouter.use(requireAuth(config));

const MAX_EXPORT_ROWS = 20000;

const isSupportedLang = (value: string): value is Lang => {
  return value === "ru" || value === "uk" || value === "en";
};

const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const validateTransactionInput = (payload: any, userId: string): TransactionInput => {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid transaction payload");
  }

  if (typeof payload.userId === "string" && payload.userId.trim() && payload.userId.trim() !== userId) {
    errors.push("userId in payload does not match the authenticated user");
  }

  const dateValue = parseDate(payload.date);
  if (!dateValue) errors.push("date is required and must be a valid date");

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push("amount must be a positive number");
  }

  const category = typeof payload.category === "string" ? payload.category.trim() : "";
  if (!category) errors.push("category is required");

  const description =
    typeof payload.description === "string" && payload.description.trim().length > 0
      ? payload.description.trim()
      : "";
  if (!description) errors.push("description is required");

  if (errors.length > 0) {
    throw new Error(errors.join(", "));
  }

  return {
    userId,
    date: dateValue!,
    amount,
    currency: typeof payload.currency === "string" && payload.currency.trim() ? payload.currency : "UAH",
    category,
    description,
    source:
      typeof payload.source === "string" && payload.source.trim().length > 0
        ? payload.source
        : "manual"
  };
};

const escapeCsvValue = (value: unknown) => {
  const str = value === null || value === undefined ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

const buildCsv = (items: TransactionForExport[], lang: Lang): string => {
  const header = [
    "date",
    "type",
    "categoryId",
    "categoryLabel",
    "amount",
    "currency",
    "description",
    "source"
  ];

  const lines = [header.map(escapeCsvValue).join(",")];

  for (const item of items) {
    const dateStr = item.date.toISOString().split("T")[0];
    const row = [
      dateStr,
      "expense",
      item.category,
      getCategoryLabel(item.category, lang),
      String(item.amount),
      item.currency,
      item.description,
      item.source
    ];
    lines.push(row.map(escapeCsvValue).join(","));
  }

  return lines.join("\n");
};

financeTransactionsRouter.get("/", async (req, res, next) => {
  try {
    const { from, to, category, page, limit } = req.query;
    const fromDate = typeof from === "string" ? parseDate(from) : undefined;
    const toDate = typeof to === "string" ? parseDate(to) : undefined;

    const pageNum = typeof page === "string" ? parseNumber(page) : undefined;
    const limitNum = typeof limit === "string" ? parseNumber(limit) : undefined;

    const result = await listTransactions({
      userId: req.user!.id,
      from: fromDate,
      to: toDate,
      category: typeof category === "string" ? category : undefined,
      page: pageNum,
      limit: limitNum
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

financeTransactionsRouter.get("/export", async (req, res, next) => {
  try {
    const { from, to, category, lang } = req.query;
    if (typeof from !== "string" || typeof to !== "string") {
      return res.status(400).json({ error: "from and to are required" });
    }

    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: "Invalid from/to dates" });
    }

    const selectedLang: Lang = typeof lang === "string" && isSupportedLang(lang) ? lang : "ru";
    const categoryFilter =
      typeof category === "string" && category.trim() ? category.trim() : undefined;

    const { items, exceedsLimit } = await getTransactionsForExport({
      userId: req.user!.id,
      from: fromDate,
      to: toDate,
      category: categoryFilter,
      maxRows: MAX_EXPORT_ROWS
    });

    if (exceedsLimit) {
      return res
        .status(413)
        .json({ error: `Too many transactions to export, max ${MAX_EXPORT_ROWS} rows allowed` });
    }

    const csv = buildCsv(items, selectedLang);
    const fromLabel = fromDate.toISOString().split("T")[0];
    const toLabel = toDate.toISOString().split("T")[0];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"transactions_${fromLabel}_${toLabel}.csv\"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

financeTransactionsRouter.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const body = req.body;
    const itemsPayload = Array.isArray(body?.items) ? body.items : body && !Array.isArray(body) ? [body] : body;
    const parsedItems = Array.isArray(itemsPayload) ? itemsPayload : [];

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({ error: "Invalid body: expected transaction object or items array" });
    }

    const transactions = parsedItems.map((item) => validateTransactionInput(item, userId));
    const created = await createTransactions(transactions);
    res.status(201).json(created.length === 1 ? created[0] : { items: created });
  } catch (error: any) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});



financeTransactionsRouter.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    const updated = await updateTransaction(id, req.user!.id, req.body || {});
    // updateTransaction() уже приводит Decimal->number, так что можно отдавать как есть
    res.json({ item: updated });
  } catch (error: any) {
    if (error instanceof Error && error.message.toLowerCase().includes("validation")) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof Error && error.message.includes("not found")) {
      return res.status(404).json({ error: "Not found" });
    }
    next(error);
  }
});

financeTransactionsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await deleteTransaction(id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return res.status(404).json({ error: "Not found" });
    }
    next(error);
  }
});
