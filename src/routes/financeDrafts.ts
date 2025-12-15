import { Router } from "express";
import { config } from "../config/env";
import { requireAuth } from "../lib/auth";
import { HttpError } from "../lib/httpError";
import {
  applyDraft,
  createDraft,
  discardDraft,
  getDraftDetails,
  listDrafts,
  updateDraft
} from "../services/financeDraftService";

export const financeDraftsRouter = Router();
financeDraftsRouter.use(requireAuth(config));

financeDraftsRouter.post("/", async (req, res, next) => {
  try {
    const { source, lang, title, items } = req.body || {};
    const result = await createDraft({
      userId: req.user!.id,
      source,
      lang,
      title,
      items
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

financeDraftsRouter.get("/", async (req, res, next) => {
  try {
    const result = await listDrafts(req.user!.id, 20);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

financeDraftsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getDraftDetails(id, req.user!.id);
    res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

financeDraftsRouter.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, items } = req.body || {};
    const result = await updateDraft({ id, userId: req.user!.id, title, items });
    res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

financeDraftsRouter.post("/:id/apply", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await applyDraft(id, req.user!.id);
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

financeDraftsRouter.post("/:id/discard", async (req, res, next) => {
  try {
    const { id } = req.params;
    await discardDraft(id, req.user!.id);
    res.json({ status: "discarded" });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});
