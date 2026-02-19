import { NextResponse } from "next/server";

import { ChunkingLimitError, chunkPagesToRecords } from "@/lib/engine/chunk-pages";
import { RequestValidationError } from "@/lib/errors";
import { runMistralOcr } from "@/lib/ocr/mistral";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const ocrResult = await runMistralOcr(formData);
    const chunks = chunkPagesToRecords(ocrResult.pages);

    return NextResponse.json({
      ...ocrResult,
      chunks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR failed";
    const status =
      error instanceof RequestValidationError
        ? error.status
        : error instanceof ChunkingLimitError
          ? error.status
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
