import dotenv from "dotenv";

dotenv.config();

const requiredString = (value: string | undefined, name: string): string => {
  if (!value || value.trim().length === 0) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
};

const databaseUrl = requiredString(process.env.DATABASE_URL, "DATABASE_URL");
const authJwtSecret = requiredString(process.env.AUTH_JWT_SECRET, "AUTH_JWT_SECRET");
const authRefreshSecret = requiredString(process.env.AUTH_REFRESH_SECRET, "AUTH_REFRESH_SECRET");

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  return defaultValue;
};

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

export const config = {
  nodeEnv,
  port: parseInt(process.env.PORT || "4001", 10),
  databaseUrl,
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  aiFinanceModel: process.env.AI_FINANCE_MODEL || "gpt-4o-mini",
  authJwtSecret,
  authRefreshSecret,
  corsOrigin: process.env.CORS_ORIGIN,
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, isProduction),
  allowBodyUserId: parseBoolean(process.env.ALLOW_BODY_USERID, false)
};

export type AppConfig = typeof config;
