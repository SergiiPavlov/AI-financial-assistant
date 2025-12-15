import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppConfig } from "../config/env";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_COOKIE = "refreshToken";

export type AuthUser = {
  id: string;
  email?: string;
  tokenVersion?: number;
};

type TokenPayload = {
  id: string;
  email?: string;
  tv?: number;
};

const buildCookieOptions = (config: AppConfig) => ({
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: config.cookieSecure
});

const signToken = (payload: TokenPayload, secret: string, expiresIn: string) =>
  jwt.sign(payload, secret, { algorithm: "HS256", expiresIn });

export const createAccessToken = (user: AuthUser, config: AppConfig) =>
  signToken({ id: user.id, email: user.email }, config.authJwtSecret, ACCESS_TOKEN_TTL);

export const createRefreshToken = (user: AuthUser, config: AppConfig) =>
  signToken({ id: user.id, email: user.email, tv: user.tokenVersion ?? 0 }, config.authRefreshSecret, REFRESH_TOKEN_TTL);

export const setRefreshTokenCookie = (res: Response, token: string, config: AppConfig) => {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...buildCookieOptions(config),
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

export const clearRefreshTokenCookie = (res: Response, config: AppConfig) => {
  res.clearCookie(REFRESH_TOKEN_COOKIE, buildCookieOptions(config));
};

export const decodeUserFromToken = (token: string, secret: string): AuthUser => {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    const userId = typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : typeof payload.sub === "string"
        ? payload.sub.trim()
        : "";

    if (!userId) {
      throw new Error("Token payload does not contain user id");
    }

    const email = typeof payload.email === "string" ? payload.email : undefined;
    const tokenVersion = typeof payload.tv === "number" ? payload.tv : undefined;

    return { id: userId, email, tokenVersion };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown token error";
    throw new Error(`Failed to decode auth token: ${message}`);
  }
};

export const attachUserFromAuthHeader = (config: AppConfig) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    const bearerToken = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!bearerToken) {
      return next();
    }

    const [, token] = bearerToken.split(" ");
    if (!token) {
      console.warn("[auth] Authorization header is present but token is missing");
      return res.status(401).json({ error: "Invalid auth token" });
    }

    try {
      const user = decodeUserFromToken(token, config.authJwtSecret);
      req.user = user;
      return next();
    } catch (error) {
      console.error(`[auth] Failed to decode token: ${(error as Error).message}`);
      return res.status(401).json({ error: "Invalid auth token" });
    }
  };
};

export const requireAuth = (_config: AppConfig) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  };
};
