import { Router } from "express";
import { healthRouter } from "./health";
import { financeTransactionsRouter } from "./financeTransactions";
import { financeSummaryRouter } from "./financeSummary";
import { financeAiRouter } from "./financeAi";
import { authRouter } from "./auth";
import { financeMetaRouter } from "./financeMeta";
import { financeDraftsRouter } from "./financeDrafts";
import { financeAnalyticsRouter } from "./financeAnalytics";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/health", healthRouter);
apiRouter.use("/finance/meta", financeMetaRouter);
apiRouter.use("/finance/transactions", financeTransactionsRouter);
apiRouter.use("/finance/summary", financeSummaryRouter);
apiRouter.use("/finance/drafts", financeDraftsRouter);
apiRouter.use("/finance/analytics", financeAnalyticsRouter);
apiRouter.use("/finance", financeAiRouter);
