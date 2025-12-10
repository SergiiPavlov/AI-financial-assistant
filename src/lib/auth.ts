import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppConfig } from "../config/env";

export type AuthUser = {
  id: string;
  email?: string;
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

    return { id: userId, email };
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
