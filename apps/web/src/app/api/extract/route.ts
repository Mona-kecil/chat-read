import { NextResponse } from "next/server";

import { ChunkingLimitError, chunkPagesToRecords } from "@/lib/engine/chunk-pages";
import { runParallelExtract } from "@/lib/ocr/parallel";
import { isHttpUrl } from "@/lib/url";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }
    if (!isHttpUrl(url)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const result = await runParallelExtract(url);
    const chunks = chunkPagesToRecords(result.pages);

    return NextResponse.json({
      ...result,
      chunks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    const status = error instanceof ChunkingLimitError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
