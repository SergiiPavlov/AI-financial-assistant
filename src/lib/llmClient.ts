import { config } from "../config/env";

export class MissingApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured");
    this.name = "MissingApiKeyError";
  }
}

export type ChatModelOptions = {
  systemPrompt: string;
  userPrompt: string;
};

export async function callChatModel(options: ChatModelOptions): Promise<string> {
  if (!config.openAiApiKey) {
    throw new MissingApiKeyError();
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.aiFinanceModel,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LLM response did not contain content");
  }
  return content;
}
