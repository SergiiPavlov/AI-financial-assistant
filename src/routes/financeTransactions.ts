import { Router } from "express";
import { listTransactions } from "../services/financeService";

export const financeTransactionsRouter = Router();

// TODO: добавить DTO/валидацию и POST для создания транзакций
financeTransactionsRouter.get("/", async (_req, res, next) => {
  try {
    const items = await listTransactions();
    res.json(items);
  } catch (error) {
    next(error);
  }
});
