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

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4001", 10),
  databaseUrl,
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  aiFinanceModel: process.env.AI_FINANCE_MODEL || "gpt-4o-mini",
  authJwtSecret
};

export type AppConfig = typeof config;
