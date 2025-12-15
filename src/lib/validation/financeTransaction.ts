import { TransactionType } from "@prisma/client";
import { HttpError } from "../httpError";

export type NormalizedTransactionInput = {
  userId?: string;
  date?: Date;
  amount?: number;
  currency?: string;
  category?: string;
  description?: string;
  source?: string;
  type?: TransactionType;
};

export type TransactionValidationOptions = {
  userId?: string;
  partial?: boolean;
  pathPrefix?: string;
};

const MAX_DESCRIPTION_LENGTH = 240;
const MAX_SOURCE_LENGTH = 50;
const MAX_CURRENCY_LENGTH = 8;

const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

const parseTransactionType = (value: any): TransactionType | undefined => {
  if (value === "income" || value === "expense") return value;
  return undefined;
};

const prefixErrors = (errors: string[], pathPrefix?: string) => {
  if (!pathPrefix) return errors;
  return errors.map((msg) => `${pathPrefix}${msg}`);
};

export const validateTransactionInput = (
  payload: any,
  options: TransactionValidationOptions = {}
): NormalizedTransactionInput => {
  const { userId, partial = false, pathPrefix } = options;
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, prefixErrors(["Invalid transaction payload"], pathPrefix).join(", "));
  }

  const errors: string[] = [];

  if (typeof payload.userId === "string" && payload.userId.trim() && userId && payload.userId.trim() !== userId) {
    errors.push("userId in payload does not match the authenticated user");
  }

  const dateValue = parseDate(payload.date);
  if (!partial || payload.date !== undefined) {
    if (!dateValue) errors.push("date is required and must be a valid date");
  }

  const amount = Number(payload.amount);
  if (!partial || payload.amount !== undefined) {
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push("amount must be a positive number");
    }
  }

  const category = typeof payload.category === "string" ? payload.category.trim() : "";
  if (!partial || payload.category !== undefined) {
    if (!category) errors.push("category is required");
  }

  let description: string | undefined = undefined;
  if (payload.description !== undefined) {
    if (typeof payload.description !== "string") {
      errors.push("description is required");
    } else {
      description = payload.description.trim();
      if (!description && !partial) {
        errors.push("description is required");
      }
    }
  } else if (!partial) {
    errors.push("description is required");
  }

  const currency =
    typeof payload.currency === "string" && payload.currency.trim()
      ? payload.currency.trim().toUpperCase()
      : undefined;
  if (currency && currency.length > MAX_CURRENCY_LENGTH) {
    errors.push(`currency must be at most ${MAX_CURRENCY_LENGTH} characters`);
  }

  const source = typeof payload.source === "string" && payload.source.trim() ? payload.source.trim() : undefined;
  if (source && source.length > MAX_SOURCE_LENGTH) {
    errors.push(`source must be at most ${MAX_SOURCE_LENGTH} characters`);
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  const type = parseTransactionType(payload.type);
  if (payload.type !== undefined && !type) {
    errors.push("type must be either expense or income");
  }

  if (errors.length > 0) {
    throw new HttpError(400, prefixErrors(errors, pathPrefix).join(", "));
  }

  return {
    userId,
    date: dateValue,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency: currency || (partial ? undefined : "UAH"),
    category: category || undefined,
    description: description === undefined ? undefined : description,
    source: source || (partial ? undefined : "manual"),
    type: type || (partial ? undefined : "expense")
  };
};

export const normalizeTransactionInput = (
  payload: any,
  options: TransactionValidationOptions = {}
): NormalizedTransactionInput => {
  return validateTransactionInput(payload, options);
};
