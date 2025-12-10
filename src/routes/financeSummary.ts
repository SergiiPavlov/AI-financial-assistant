import { Router } from "express";
import { getSummary, GroupByOption } from "../services/financeService";
import { getEffectiveUserId } from "../lib/userContext";

export const financeSummaryRouter = Router();

const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

financeSummaryRouter.get("/", async (req, res, next) => {
  try {
    const { from, to, groupBy } = req.query;
    const userId = getEffectiveUserId(req);

    const fromDate = typeof from === "string" ? parseDate(from) : undefined;
    const toDate = typeof to === "string" ? parseDate(to) : undefined;

    if (!fromDate || !toDate) {
      return res.status(400).json({ error: "from and to dates are required" });
    }

    const groupByValue: GroupByOption =
      groupBy === "category" || groupBy === "date" || groupBy === "both" ? (groupBy as GroupByOption) : "both";

    const summary = await getSummary({
      userId,
      from: fromDate,
      to: toDate,
      groupBy: groupByValue
    });

    res.json(summary);
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("userId is required")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});
