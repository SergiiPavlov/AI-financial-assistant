import { Request } from "express";

export const getEffectiveUserId = (req: Request, allowBodyUserId = false): string => {
  const tokenUserId = req.user?.id?.trim();
  const bodyUserId = typeof (req.body as any)?.userId === "string" ? (req.body as any).userId.trim() : "";

  if (tokenUserId) return tokenUserId;
  if (allowBodyUserId && bodyUserId) {
    console.warn("[auth] Falling back to userId from body, this is deprecated.");
    return bodyUserId;
  }

  throw new Error("userId is required (token or body)");
};
