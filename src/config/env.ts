import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4001", 10),
  databaseUrl: process.env.DATABASE_URL || "",
  openAiApiKey: process.env.OPENAI_API_KEY || ""
};
