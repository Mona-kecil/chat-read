import { NextResponse } from "next/server";

import { chunkMarkdown } from "@/lib/engine/chunk";
import { runParallelExtract } from "@/lib/ocr/parallel";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const result = await runParallelExtract(url);
    let sequence = 1;
    const chunks = result.pages.flatMap((page, pagePosition) => {
      const pageChunks = chunkMarkdown(page.markdown ?? "");
      const pageIndex = page.index ?? pagePosition;
      return pageChunks.map((chunk) => ({
        order: sequence++,
        text: chunk.text,
        pageIndex,
      }));
    });

    return NextResponse.json({
      ...result,
      chunks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
