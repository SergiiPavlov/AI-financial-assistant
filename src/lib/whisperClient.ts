import { File } from "node:buffer";
import { config } from "../config/env";
import { MissingApiKeyError } from "./llmClient";

export type TranscriptionResult = {
  text: string;
};

export async function transcribeAudio(fileBuffer: Buffer, fileName: string, mimeType?: string): Promise<TranscriptionResult> {
  if (!config.openAiApiKey) {
    throw new MissingApiKeyError();
  }

  const form = new FormData();
  const file = new File([fileBuffer], fileName || "audio.webm", { type: mimeType || "application/octet-stream" });
  form.append("file", file as any);
  form.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as any;
  if (!data?.text) {
    throw new Error("Whisper response did not contain text");
  }

  return { text: data.text as string };
}
