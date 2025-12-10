import { Router } from "express";
import { healthRouter } from "./health";
import { financeTransactionsRouter } from "./financeTransactions";
import { financeSummaryRouter } from "./financeSummary";
import { financeAiRouter } from "./financeAi";
import { authDemoRouter } from "./authDemo";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authDemoRouter);
apiRouter.use("/finance/transactions", financeTransactionsRouter);
apiRouter.use("/finance/summary", financeSummaryRouter);
apiRouter.use("/finance", financeAiRouter);
