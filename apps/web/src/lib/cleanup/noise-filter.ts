import "server-only";

import type { MarkdownChunk } from "@/lib/engine/chunk";
import { z } from "zod";

import { buildCacheKey, getCached, setCached } from "./cache";
import { generateStructuredOutput } from "./llm";
import { buildChunkWindow, type ChunkWithPage } from "./window";

export type CleanupStats = {
  total: number;
  kept: number;
  omitted: number;
  uncertain: number;
  lowConfidenceKept: number;
  llmCalls: number;
  cacheHits: number;
};

export type CleanupTrace = {
  order: number;
  pageIndex: number;
  decision: "keep" | "omit" | "uncertain";
  reasons: string[];
  confidence: number;
};

export type FilterNoiseResult = {
  chunks: MarkdownChunk[];
  stats: CleanupStats;
  trace: CleanupTrace[];
};

const CLASSIFY_PROMPT_VERSION = "ocr-noise-classify-v2";
const OMIT_CONFIDENCE_THRESHOLD = 0.68;

const classificationSchema = z.object({
  decision: z.enum(["keep", "omit", "uncertain"]),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).max(6),
});

const buildHints = (text: string) => {
  const trimmed = text.trim();
  const digitCount = trimmed.match(/\d/g)?.length ?? 0;
  const alphaCount = trimmed.match(/[A-Za-z]/g)?.length ?? 0;
  const upperCount = trimmed.match(/[A-Z]/g)?.length ?? 0;
  const punctuationCount = trimmed.match(/[^\w\s]/g)?.length ?? 0;
  const hasIpLike = /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(trimmed);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  return {
    charCount: trimmed.length,
    wordCount,
    hasTerminalPunctuation: /[.!?]"?$/.test(trimmed),
    startsWithUppercase: /^[A-Z]/.test(trimmed),
    looksLikeSentence: /\s/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed),
    digitRatio: Number((digitCount / Math.max(trimmed.length, 1)).toFixed(3)),
    alphaRatio: Number((alphaCount / Math.max(trimmed.length, 1)).toFixed(3)),
    upperRatio: Number((upperCount / Math.max(alphaCount, 1)).toFixed(3)),
    punctuationRatio: Number((punctuationCount / Math.max(trimmed.length, 1)).toFixed(3)),
    hasIpLike,
    isStandaloneShortLabel: wordCount <= 3 && trimmed.length <= 40,
  };
};

const serializeWindow = ({
  target,
  prev,
  next,
}: {
  target: ChunkWithPage;
  prev: Array<{ order: number; pageIndex: number; distance: number; crossPage: boolean; text: string }>;
  next: Array<{ order: number; pageIndex: number; distance: number; crossPage: boolean; text: string }>;
}) =>
  JSON.stringify({
    target,
    prev,
    next,
  });

const formatNeighbor = (value: {
  order: number;
  pageIndex: number;
  distance: number;
  crossPage: boolean;
  text: string;
}) =>
  `- order=${value.order} page=${value.pageIndex} distance=${value.distance} cross_page=${value.crossPage ? "yes" : "no"}\n  ${value.text}`;

export const filterNoiseChunks = async (
  inputChunks: ChunkWithPage[],
  options?: {
    enabled?: boolean;
    model?: string;
    documentTitle?: string;
    deadlineMs?: number;
    perCallTimeoutMs?: number;
  },
): Promise<FilterNoiseResult> => {
  const enabled = options?.enabled ?? true;
  const model = options?.model ?? "google/gemini-3-flash-preview";
  const deadlineAt = Date.now() + (options?.deadlineMs ?? 25000);
  const perCallTimeoutMs = options?.perCallTimeoutMs ?? 7000;
  const stats: CleanupStats = {
    total: inputChunks.length,
    kept: 0,
    omitted: 0,
    uncertain: 0,
    lowConfidenceKept: 0,
    llmCalls: 0,
    cacheHits: 0,
  };
  const trace: CleanupTrace[] = [];

  if (!enabled || inputChunks.length === 0) {
    return {
      chunks: inputChunks.map((chunk, index) => ({ order: index + 1, text: chunk.text })),
      stats: {
        ...stats,
        kept: inputChunks.length,
        lowConfidenceKept: inputChunks.length,
      },
      trace,
    };
  }

  const output: ChunkWithPage[] = [];

  for (let index = 0; index < inputChunks.length; index += 1) {
    if (Date.now() >= deadlineAt) {
      const remaining = inputChunks.slice(index);
      output.push(...remaining);
      stats.kept += remaining.length;
      stats.lowConfidenceKept += remaining.length;
      break;
    }

    const window = buildChunkWindow(inputChunks, index, 3, "page-aware");
    const targetHints = buildHints(window.target.text);

    const classifyPayload = serializeWindow({
      target: window.target,
      prev: window.prev,
      next: window.next,
    });

    const classifyKey = buildCacheKey({
      model,
      phase: "classify",
      promptVersion: CLASSIFY_PROMPT_VERSION,
      payload: classifyPayload,
    });

    let classification = getCached<z.infer<typeof classificationSchema>>(classifyKey);
    if (classification) {
      stats.cacheHits += 1;
    } else {
      try {
        stats.llmCalls += 1;
      classification = await generateStructuredOutput({
        schema: classificationSchema,
        system: [
          "You classify OCR chunks as keep, omit, or uncertain.",
          "Only classify TARGET. PREV/NEXT are evidence-only context and must not be rewritten.",
          "Policy: standalone labels like 'Confidential' should be omitted only when context indicates header/footer or repeated boilerplate; otherwise keep.",
          "If TARGET is a short standalone token/phrase that does not flow semantically with neighbors and looks like logo/header/watermark noise, choose omit.",
          "If unsure, return uncertain.",
        ].join(" "),
        prompt: [
          "Return JSON only matching schema.",
          "Examples:",
          'GOOD (keep): TARGET="Dear Partners," and NEXT starts a letter body paragraph.',
          'GOOD (keep): TARGET is a full sentence/paragraph from the letter body.',
          'BAD (omit): TARGET="Confidential" isolated near page top with unrelated neighbors.',
          'BAD (omit): TARGET="118.99.88.232" appears as standalone first bubble and NEXT is "Ribbit Capital".',
          'BAD (omit): TARGET="Ribbit Capital" appears as isolated logo text before quote/body paragraphs.',
          'GOOD (keep): TARGET="confidential information is subject to NDA" in a full sentence paragraph.',
          "Rules:",
          "- Prefer KEEP for sentence-like body prose.",
          "- Prefer OMIT only for standalone artifact chunks that do not flow with neighbors (labels, headers, watermark/logo text, ID/IP-like strings).",
          "- If TARGET could plausibly be body text, choose KEEP or UNCERTAIN (not OMIT).",
          "",
          `DOCUMENT_TITLE: ${options?.documentTitle ?? "(unknown)"}`,
          `PAGE_POSITION: chunk ${window.target.pageChunkIndex ?? 0} of ${window.target.pageChunkCount ?? 0} on page ${window.target.pageIndex}`,
          `TARGET_HINTS: ${JSON.stringify(targetHints)}`,
            "",
            `TARGET (order=${window.target.order}, page=${window.target.pageIndex}):`,
            window.target.text,
            "",
            "PREV_CONTEXT:",
            window.prev.map(formatNeighbor).join("\n") || "- (none)",
            "",
            "NEXT_CONTEXT:",
            window.next.map(formatNeighbor).join("\n") || "- (none)",
          ].join("\n"),
          timeoutMs: perCallTimeoutMs,
        });
        setCached(classifyKey, classification);
      } catch {
        classification = {
          decision: "uncertain",
          confidence: 0,
          reasons: ["classification-timeout-or-error"],
        };
      }
    }

    if (classification.decision === "omit" && classification.confidence >= OMIT_CONFIDENCE_THRESHOLD) {
      stats.omitted += 1;
      trace.push({
        order: window.target.order,
        pageIndex: window.target.pageIndex,
        decision: "omit",
        reasons: classification.reasons,
        confidence: classification.confidence,
      });
      continue;
    }

    if (classification.decision === "uncertain") {
      stats.uncertain += 1;
    }

    if (classification.decision === "omit" && classification.confidence < OMIT_CONFIDENCE_THRESHOLD) {
      stats.lowConfidenceKept += 1;
    }

    output.push(window.target);
    stats.kept += 1;
    trace.push({
      order: window.target.order,
      pageIndex: window.target.pageIndex,
      decision: classification.decision,
      reasons: classification.reasons,
      confidence: classification.confidence,
    });
  }

  const chunks = output.map((chunk, index) => ({ order: index + 1, text: chunk.text }));
  return { chunks, stats, trace };
};
