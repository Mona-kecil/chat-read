import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {},
  runtimeEnv: {
    AI_GATEWAY_API_KEY: z.string(),
  },
  emptyStringAsUndefined: true,
});
