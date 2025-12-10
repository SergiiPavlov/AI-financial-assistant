import { Router } from "express";
import { healthRouter } from "./health";
import { financeTransactionsRouter } from "./financeTransactions";
import { financeSummaryRouter } from "./financeSummary";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/finance/transactions", financeTransactionsRouter);
apiRouter.use("/finance/summary", financeSummaryRouter);

// Будущие роуты:
// - /finance/parse-text
// - /finance/voice
// - /finance/assistant
