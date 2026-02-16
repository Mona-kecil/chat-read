import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {},
  server: {
    MISTRAL_API_KEY: z.string(),
    PARALLEL_API_KEY: z.string().optional(),
  },
  runtimeEnv: {
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    PARALLEL_API_KEY: process.env.PARALLEL_API_KEY,
  },
  emptyStringAsUndefined: true,
});
