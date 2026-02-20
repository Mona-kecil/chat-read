import { createScorer } from "evalite";

const WRAPPER_PATTERN = /(\bon\s+x\b|\ben\s+x\b|[|/]\s*x\b)/iu;
const QUOTE_EDGE_PATTERN = /^["'“”]|["'“”]$/u;
const TRAILING_PUNCTUATION_PATTERN = /[.!?:;]+$/u;
const META_TALK_PATTERN = /\b(this article|this page|summary|explains)\b/iu;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export type TitleEvalInput = {
  id: string;
  category: string;
  snippet: string;
  simulatedRaw: Record<"legacy" | "current", string | null>;
};

export type TitleEvalOutput = {
  source: "fixture" | "live";
  legacyRaw: string | null;
  currentRaw: string | null;
  legacy: string | null;
  current: string | null;
};

const normalizeString = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const tokenize = (value: string): string[] => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token));
};

const semanticSimilarity = (candidate: string, expected: string): number => {
  const candidateTokens = new Set(tokenize(candidate));
  const expectedTokens = new Set(tokenize(expected));

  if (!candidateTokens.size || !expectedTokens.size) {
    return 0;
  }

  const overlapCount = [...candidateTokens].filter((token) => expectedTokens.has(token)).length;
  const unionCount = new Set([...candidateTokens, ...expectedTokens]).size;

  return unionCount === 0 ? 0 : overlapCount / unionCount;
};

const computeShapeIssues = (title: string | null): string[] => {
  if (!title) {
    return ["empty"];
  }

  const issues: string[] = [];

  if (QUOTE_EDGE_PATTERN.test(title)) {
    issues.push("quote_edges");
  }

  if (WRAPPER_PATTERN.test(title)) {
    issues.push("social_wrapper");
  }

  if (TRAILING_PUNCTUATION_PATTERN.test(title)) {
    issues.push("trailing_punctuation");
  }

  if (META_TALK_PATTERN.test(title)) {
    issues.push("meta_talk");
  }

  if (title.length < 4 || title.length > 120) {
    issues.push("length");
  }

  return issues;
};

const shapeScore = (title: string | null): number => {
  const issues = computeShapeIssues(title);
  if (issues.includes("empty")) {
    return 0;
  }

  const penalty = 0.2 * issues.length;
  return Math.max(0, 1 - penalty);
};

const canonicalMatchScore = (title: string | null, expected: string): number => {
  if (!title) {
    return 0;
  }

  const normalizedTitle = normalizeString(title);
  const normalizedExpected = normalizeString(expected);

  if (!normalizedTitle || !normalizedExpected) {
    return 0;
  }

  if (normalizedTitle === normalizedExpected) {
    return 1;
  }

  if (
    normalizedTitle.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedTitle)
  ) {
    return 0.8;
  }

  return semanticSimilarity(title, expected);
};

const qualityScore = (title: string | null, expected: string): number => {
  const similarity = canonicalMatchScore(title, expected);
  const formatting = shapeScore(title);
  return 0.7 * similarity + 0.3 * formatting;
};

export const canonicalShapeScorer = createScorer<TitleEvalInput, TitleEvalOutput, string>({
  name: "Canonical title shape",
  description: "Checks wrapper/noise removal and strict formatting constraints",
  scorer: ({ output }) => {
    const issues = computeShapeIssues(output.current);
    return {
      score: shapeScore(output.current),
      metadata: {
        source: output.source,
        current: output.current,
        issues,
      },
    };
  },
});

export const expectedTitleMatchScorer = createScorer<TitleEvalInput, TitleEvalOutput, string>({
  name: "Expected title match",
  description: "Scores exact/near match against expected canonical title",
  scorer: ({ output, expected }) => {
    const score = canonicalMatchScore(output.current, expected ?? "");
    return {
      score,
      metadata: {
        current: output.current,
        expected,
      },
    };
  },
});

export const semanticOverlapScorer = createScorer<TitleEvalInput, TitleEvalOutput, string>({
  name: "Semantic overlap",
  description: "Soft semantic scorer based on token overlap with expected title",
  scorer: ({ output, expected }) => {
    if (!output.current || !expected) {
      return {
        score: 0,
        metadata: {
          current: output.current,
          expected,
          overlap: [] as string[],
        },
      };
    }

    const currentTokens = new Set(tokenize(output.current));
    const expectedTokens = new Set(tokenize(expected));
    const overlap = [...currentTokens].filter((token) => expectedTokens.has(token));

    return {
      score: semanticSimilarity(output.current, expected),
      metadata: {
        current: output.current,
        expected,
        overlap,
      },
    };
  },
});

export const pairwiseRegressionScorer = createScorer<TitleEvalInput, TitleEvalOutput, string>({
  name: "Pairwise regression (current >= legacy)",
  description: "Compares current prompt quality to legacy baseline per fixture",
  scorer: ({ output, expected }) => {
    const expectedTitle = expected ?? "";
    const currentQuality = qualityScore(output.current, expectedTitle);
    const legacyQuality = qualityScore(output.legacy, expectedTitle);
    const delta = currentQuality - legacyQuality;

    const score = delta >= 0.05 ? 1 : delta >= 0 ? 0.8 : delta >= -0.05 ? 0.4 : 0;

    return {
      score,
      metadata: {
        expected: expectedTitle,
        current: output.current,
        legacy: output.legacy,
        currentQuality,
        legacyQuality,
        delta,
      },
    };
  },
});
