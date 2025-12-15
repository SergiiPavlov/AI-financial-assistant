import { Router } from "express";
import { prisma } from "../lib/prisma";
import { config } from "../config/env";
import {
  attachUserFromAuthHeader,
  clearRefreshTokenCookie,
  createAccessToken,
  createRefreshToken,
  decodeUserFromToken,
  REFRESH_TOKEN_COOKIE,
  requireAuth,
  setRefreshTokenCookie
} from "../lib/auth";

export const authRouter = Router();

authRouter.post("/demo-login", async (req, res, next) => {
  try {
    const emailInput = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const email = emailInput || "demo_user@example.com";

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email } });
    }

    const authUser = { id: user.id, email: user.email, tokenVersion: user.tokenVersion };
    const accessToken = createAccessToken(authUser, config);
    const refreshToken = createRefreshToken(authUser, config);

    setRefreshTokenCookie(res, refreshToken, config);

    res.json({
      accessToken,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", attachUserFromAuthHeader(config), async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token missing" });
    }

    const refreshUser = decodeUserFromToken(refreshToken, config.authRefreshSecret);
    const user = await prisma.user.findUnique({ where: { id: refreshUser.id } });

    if (!user || user.tokenVersion !== (refreshUser.tokenVersion ?? 0)) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const authUser = { id: user.id, email: user.email, tokenVersion: user.tokenVersion };
    const newAccess = createAccessToken(authUser, config);
    const newRefresh = createRefreshToken(authUser, config);

    setRefreshTokenCookie(res, newRefresh, config);

    res.json({
      accessToken: newAccess,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error("[auth] refresh error", error);
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

authRouter.post("/logout", attachUserFromAuthHeader(config), requireAuth(config), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } }
    });
    clearRefreshTokenCookie(res, config);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
