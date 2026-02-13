import { NextResponse } from "next/server";
import { env } from "@chat-read/env/web";

import { filterNoiseChunks, type FilterNoiseResult } from "@/lib/cleanup/noise-filter";
import { chunkMarkdown } from "@/lib/engine/chunk";
import { runMistralOcr } from "@/lib/ocr/mistral";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const documentTitle = fileEntry instanceof File ? fileEntry.name : undefined;
    const ocrResult = await runMistralOcr(formData);
    let sequence = 1;
    const rawChunks = ocrResult.pages.flatMap((page, pagePosition) => {
      const pageChunks = chunkMarkdown(page.markdown ?? "");
      const pageIndex = page.index ?? pagePosition;
      return pageChunks.map((chunk, chunkIndex) => ({
        order: sequence++,
        text: chunk.text,
        pageIndex,
        pageChunkIndex: chunkIndex,
        pageChunkCount: pageChunks.length,
      }));
    });
    const cleanupEnabled = env.OCR_CLEANUP_ENABLED === "true" && Boolean(env.OPENROUTER_API_KEY);
    const cleanupDisabledReason =
      env.OCR_CLEANUP_ENABLED !== "true"
        ? "OCR cleanup is disabled by OCR_CLEANUP_ENABLED=false."
        : !env.OPENROUTER_API_KEY
          ? "OCR cleanup skipped: OPENROUTER_API_KEY is not set."
          : null;

    let cleanupResult: FilterNoiseResult = {
      chunks: rawChunks,
      stats: {
        total: rawChunks.length,
        kept: rawChunks.length,
        omitted: 0,
        uncertain: 0,
        lowConfidenceKept: rawChunks.length,
        llmCalls: 0,
        cacheHits: 0,
      },
      trace: [],
    };

    let cleanupWarning: string | null = cleanupDisabledReason;

    if (cleanupEnabled) {
      try {
        cleanupResult = await filterNoiseChunks(rawChunks, {
          enabled: true,
          model: env.OPENROUTER_MODEL,
          documentTitle,
        });
      } catch {
        cleanupWarning =
          "OCR cleanup failed and was skipped for this run. Check OPENROUTER_API_KEY / OPENROUTER_MODEL.";
        cleanupResult = {
          chunks: rawChunks,
          stats: {
            total: rawChunks.length,
            kept: rawChunks.length,
            omitted: 0,
            uncertain: 0,
            lowConfidenceKept: rawChunks.length,
            llmCalls: 0,
            cacheHits: 0,
          },
          trace: [],
        };
      }
    }

    return NextResponse.json({
      ...ocrResult,
      chunks: cleanupResult.chunks,
      cleanupStats: cleanupResult.stats,
      cleanupWarning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
