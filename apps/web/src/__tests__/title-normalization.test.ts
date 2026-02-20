import { describe, expect, it } from "vitest";

import {
  finalizeGeneratedTitle,
  normalizeExtractedTitle,
  sanitizeGeneratedTitle,
} from "@/lib/ocr/title-normalization";

describe("normalizeExtractedTitle", () => {
  it("extracts quoted title from X/Twitter composite titles", () => {
    const title = normalizeExtractedTitle(
      'Lance Martin en X: "Prompt auto-caching with Claude" / X',
    );
    expect(title).toBe("Prompt auto-caching with Claude");
  });

  it("extracts quoted title from curly quote wrappers", () => {
    const title = normalizeExtractedTitle("Author on X: “Prompt caching deep dive” | X");
    expect(title).toBe("Prompt caching deep dive");
  });

  it("falls back to cleaned raw title when no quoted phrase exists", () => {
    const title = normalizeExtractedTitle("  Building Better RAG Systems.  ");
    expect(title).toBe("Building Better RAG Systems");
  });

  it("drops social wrapper titles when no quoted title exists", () => {
    const title = normalizeExtractedTitle("Lance Martin on X | X");
    expect(title).toBeUndefined();
  });

  it("returns undefined for empty values", () => {
    expect(normalizeExtractedTitle("   ")).toBeUndefined();
    expect(normalizeExtractedTitle(undefined)).toBeUndefined();
  });
});

describe("sanitizeGeneratedTitle", () => {
  it("normalizes surrounding quotes and punctuation", () => {
    expect(sanitizeGeneratedTitle('"Prompt auto-caching with Claude."')).toBe(
      "Prompt auto-caching with Claude",
    );
  });
});

describe("finalizeGeneratedTitle", () => {
  it("maps long comparison fallbacks to a concise trade-offs title", () => {
    const snippet =
      "This note compares OCR providers, retry strategy, and chunk overlap in production pipelines.";

    expect(finalizeGeneratedTitle("OCR Providers Retry Strategy Chunk Overlap", snippet)).toBe(
      "OCR pipeline trade-offs",
    );
  });

  it("keeps strong canonical titles unchanged", () => {
    const snippet = "A walkthrough of retrieval quality metrics and ranking baselines.";

    expect(finalizeGeneratedTitle("Building Better RAG Systems", snippet)).toBe(
      "Building Better RAG Systems",
    );
  });

  it("does not rewrite labelled titles that mention trade-offs without comparison intent", () => {
    const snippet =
      "Page metadata\nTitle: Caching Strategies for Long Context Agents\nDescription: trade-offs in token budgets";

    expect(finalizeGeneratedTitle("Caching Strategies for Long Context Agents", snippet)).toBe(
      "Caching Strategies for Long Context Agents",
    );
  });
});
