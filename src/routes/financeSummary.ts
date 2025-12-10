import { Router } from "express";
import { getSummary } from "../services/financeService";

export const financeSummaryRouter = Router();

financeSummaryRouter.get("/", async (_req, res, next) => {
  try {
    const summary = await getSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});
