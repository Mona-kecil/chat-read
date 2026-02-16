import Parallel from "parallel-web";
import { env } from "@chat-read/env/web";

export type ParallelExtractResult = {
  pages: Array<{ index: number; markdown: string; images: never[] }>;
  model: string;
  title?: string;
};

export const runParallelExtract = async (url: string): Promise<ParallelExtractResult> => {
  if (!env.PARALLEL_API_KEY) {
    throw new Error("Missing PARALLEL_API_KEY");
  }

  const client = new Parallel({ apiKey: env.PARALLEL_API_KEY });
  const response = await client.beta.extract({
    urls: [url],
    excerpts: false,
    full_content: true,
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
    title: result.title ?? undefined,
  };
};
