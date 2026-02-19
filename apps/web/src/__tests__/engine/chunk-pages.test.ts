import { describe, expect, it } from "vitest";

import { ChunkingLimitError, chunkPagesToRecords } from "@/lib/engine/chunk-pages";

describe("chunkPagesToRecords", () => {
  it("should chunk across pages with stable ordering", () => {
    const chunks = chunkPagesToRecords([
      { index: 5, markdown: "Hello world." },
      { markdown: "Second page." },
    ]);

    expect(chunks.length).toBe(2);
    expect(chunks[0]).toMatchObject({ order: 1, pageIndex: 5 });
    expect(chunks[1]).toMatchObject({ order: 2, pageIndex: 1 });
  });

  it("should fail fast when total markdown chars exceed the limit", () => {
    const text = "a".repeat(50);
    expect(() =>
      chunkPagesToRecords([{ markdown: text }, { markdown: text }], { maxTotalMarkdownChars: 80 }),
    ).toThrow(ChunkingLimitError);
  });
});
