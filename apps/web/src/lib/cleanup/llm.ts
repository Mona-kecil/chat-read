import "server-only";

import { Output, generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "@chat-read/env/web";
import { z } from "zod";

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const shouldRetry = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  if (message.includes("rate limit") || message.includes("timeout")) {
    return true;
  }
  const statusMatch = message.match(/\b(\d{3})\b/);
  if (!statusMatch) {
    return false;
  }
  return RETRYABLE_STATUS.has(Number(statusMatch[1]));
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const generateStructuredOutput = async <TSchema extends z.ZodTypeAny>({
  schema,
  system,
  prompt,
  maxOutputTokens = 400,
  timeoutMs = 4500,
  maxRetries = 1,
}: {
  schema: TSchema;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<z.infer<TSchema>> => {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  const provider = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      const result = await generateText({
        model: provider(env.OPENROUTER_MODEL),
        temperature: 0,
        maxOutputTokens,
        timeout: timeoutMs,
        system,
        prompt,
        output: Output.object({ schema }),
      });
      return result.output as z.infer<TSchema>;
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (!shouldRetry(error) || attempt > maxRetries) {
        break;
      }
      await sleep(250 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to generate structured output");
};
