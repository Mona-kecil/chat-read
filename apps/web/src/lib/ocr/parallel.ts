import Parallel from "parallel-web";
import { env } from "@chat-read/env/web";
import { normalizeExtractedTitle } from "@/lib/ocr/title-normalization";

const EXTRACT_TIMEOUT_MS = 20_000;
const LIVE_FETCH_TIMEOUT_SECONDS = 8;

export type ParallelExtractResult = {
  pages: Array<{ index: number; markdown: string; images: never[] }>;
  model: string;
  title?: string;
};

export const runParallelExtract = async (url: string): Promise<ParallelExtractResult> => {
  if (!env.PARALLEL_API_KEY) {
    throw new Error("Missing PARALLEL_API_KEY");
  }

  const client = new Parallel({
    apiKey: env.PARALLEL_API_KEY,
    timeout: EXTRACT_TIMEOUT_MS,
    maxRetries: 0,
  });
  const response = await client.beta.extract({
    urls: [url],
    excerpts: false,
    full_content: true,
    fetch_policy: {
      timeout_seconds: LIVE_FETCH_TIMEOUT_SECONDS,
      disable_cache_fallback: false,
    },
  });

  if (response.errors?.length) {
    const err = response.errors[0];
    throw new Error(err?.content ?? `Failed to extract content from ${url}`);
  }

  const result = response.results?.[0];
  if (!result?.full_content) {
    throw new Error(`No content extracted from ${url}`);
  }

  return {
    pages: [
      {
        index: 0,
        markdown: result.full_content,
        images: [],
      },
    ],
    model: "parallel-extract",
    title: normalizeExtractedTitle(result.title),
  };
};
