import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {},
  server: {
    MISTRAL_API_KEY: z.string(),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().default("google/gemini-3-flash-preview"),
    OCR_CLEANUP_ENABLED: z.enum(["true", "false"]).default("true"),
    OCR_SEGMENT_LLM_FALLBACK_ENABLED: z.enum(["true", "false"]).default("false"),
  },
  runtimeEnv: {
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OCR_CLEANUP_ENABLED: process.env.OCR_CLEANUP_ENABLED,
    OCR_SEGMENT_LLM_FALLBACK_ENABLED: process.env.OCR_SEGMENT_LLM_FALLBACK_ENABLED,
  },
  emptyStringAsUndefined: true,
});
