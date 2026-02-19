import { chunkMarkdown } from "@/lib/engine/chunk";

export type ChunkedPageInput = {
  index?: number | null;
  markdown?: string | null;
};

export type ChunkedRecord = {
  order: number;
  text: string;
  pageIndex: number;
};

export type ChunkPagesOptions = {
  maxPages?: number;
  maxTotalMarkdownChars?: number;
  maxChunks?: number;
};

export class ChunkingLimitError extends Error {
  readonly status: number;

  constructor(message: string, status = 413) {
    super(message);
    this.name = "ChunkingLimitError";
    this.status = status;
  }
}

const DEFAULT_OPTIONS: Required<ChunkPagesOptions> = {
  // Guardrails only: if you hit these, it's better to fail fast than to block the server.
  maxPages: 250,
  maxTotalMarkdownChars: 500_000,
  maxChunks: 5_000,
};

export const chunkPagesToRecords = (
  pages: ChunkedPageInput[],
  options?: ChunkPagesOptions,
): ChunkedRecord[] => {
  const { maxPages, maxTotalMarkdownChars, maxChunks } = { ...DEFAULT_OPTIONS, ...options };

  if (pages.length > maxPages) {
    throw new ChunkingLimitError(
      `Too many pages to chunk on server (pages=${pages.length}, maxPages=${maxPages})`,
    );
  }

  let totalChars = 0;
  for (const page of pages) {
    totalChars += (page.markdown ?? "").length;
  }
  if (totalChars > maxTotalMarkdownChars) {
    throw new ChunkingLimitError(
      `Document too large to chunk on server (chars=${totalChars}, maxChars=${maxTotalMarkdownChars})`,
    );
  }

  let sequence = 1;
  const chunks: ChunkedRecord[] = [];
  for (const [pagePosition, page] of pages.entries()) {
    const pageIndex = page.index ?? pagePosition;
    const pageChunks = chunkMarkdown(page.markdown ?? "");
    for (const chunk of pageChunks) {
      chunks.push({ order: sequence++, text: chunk.text, pageIndex });
      if (chunks.length > maxChunks) {
        throw new ChunkingLimitError(
          `Too many chunks generated (chunks=${chunks.length}, maxChunks=${maxChunks})`,
        );
      }
    }
  }

  return chunks;
};
