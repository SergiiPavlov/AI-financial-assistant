import { Router } from "express";
import {
  createTransactions,
  deleteTransaction,
  listTransactions,
  TransactionInput
} from "../services/financeService";

export const financeTransactionsRouter = Router();

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

const validateTransactionInput = (payload: any): TransactionInput => {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid transaction payload");
  }

  const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
  if (!userId) errors.push("userId is required");

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

financeTransactionsRouter.get("/", async (req, res, next) => {
  try {
    const { from, to, category, page, limit, userId } = req.query;
    const fromDate = typeof from === "string" ? parseDate(from) : undefined;
    const toDate = typeof to === "string" ? parseDate(to) : undefined;

    const pageNum = typeof page === "string" ? parseNumber(page) : undefined;
    const limitNum = typeof limit === "string" ? parseNumber(limit) : undefined;

    const result = await listTransactions({
      userId: typeof userId === "string" ? userId : undefined,
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

financeTransactionsRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body;
    const itemsPayload = Array.isArray(body?.items) ? body.items : body && !Array.isArray(body) ? [body] : body;
    const parsedItems = Array.isArray(itemsPayload) ? itemsPayload : [];

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({ error: "Invalid body: expected transaction object or items array" });
    }

    const transactions = parsedItems.map((item) => validateTransactionInput(item));
    const created = await createTransactions(transactions);
    res.status(201).json(created.length === 1 ? created[0] : { items: created });
  } catch (error: any) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

financeTransactionsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await deleteTransaction(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
