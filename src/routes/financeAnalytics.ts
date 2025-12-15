import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { config } from "../config/env";
import { getAnalytics } from "../services/financeService";
import { HttpError } from "../lib/httpError";

export const financeAnalyticsRouter = Router();
financeAnalyticsRouter.use(requireAuth(config));

const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

const parseType = (value?: string): "income" | "expense" | "all" | undefined => {
  if (value === "income" || value === "expense" || value === "all") return value;
  return undefined;
};

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return undefined;
  return num;
};

financeAnalyticsRouter.get("/", async (req, res, next) => {
  try {
    const { from, to, type, topN, limitLargest } = req.query;

    if (typeof from !== "string" || typeof to !== "string") {
      throw new HttpError(400, "from and to are required");
    }

    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    if (!fromDate || !toDate) {
      throw new HttpError(400, "Invalid from/to dates");
    }

    const parsedType = parseType(typeof type === "string" ? type : undefined) || "expense";
    const parsedTopN = parsePositiveInt(typeof topN === "string" ? topN : undefined);
    const parsedLimitLargest = parsePositiveInt(typeof limitLargest === "string" ? limitLargest : undefined);

    if (topN !== undefined && parsedTopN === undefined) {
      throw new HttpError(400, "Invalid topN parameter");
    }

    if (limitLargest !== undefined && parsedLimitLargest === undefined) {
      throw new HttpError(400, "Invalid limitLargest parameter");
    }

    const analytics = await getAnalytics({
      userId: req.user!.id,
      from: fromDate,
      to: toDate,
      type: parsedType,
      topN: parsedTopN,
      limitLargest: parsedLimitLargest
    });

    res.json(analytics);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

