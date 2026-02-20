const QUOTED_TITLE_PATTERNS = [/["“”]([^"“”]{3,200})["“”]/u, /[']([^']{3,200})[']/u];

const SOCIAL_WRAPPER_PATTERN = /(\bon\s+x\b|\ben\s+x\b|[|/]\s*x\s*$)/iu;
const COMPARISON_INTENT_PATTERN = /(\bcompares?\b|\bcomparison\b|\bversus\b|\bvs\.?\b)/iu;
const PIPELINE_CONTEXT_PATTERN = /(\bpipelines?\b|\bworkflow\b|\barchitecture\b|\bsystems?\b)/iu;
const STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);

const cleanTitle = (value: string): string =>
  value
    .replace(/[\s\u00A0]+/gu, " ")
    .replace(/[“”]/gu, '"')
    .trim()
    .replace(/^['"]+|['"]+$/gu, "")
    .replace(/[\s.:;!?-]+$/gu, "")
    .trim();

const toTitleWord = (value: string): string => {
  if (!value) {
    return value;
  }

  return `${value[0]!.toUpperCase()}${value.slice(1).toLowerCase()}`;
};

const inferComparisonTitle = (title: string, snippet: string): string => {
  const combined = `${title} ${snippet}`;
  const hasOcr = /\bocr\b/iu.test(combined);
  const hasPipelineContext = PIPELINE_CONTEXT_PATTERN.test(snippet);

  const titleTokens = cleanTitle(title)
    .toLowerCase()
    .split(/\s+/u)
    .filter((token) => token.length > 2)
    .filter((token) => !STOP_WORDS.has(token));
  const fallbackSubject = toTitleWord(titleTokens[0] ?? "Topic");
  const subject = hasOcr ? "OCR" : fallbackSubject;

  if (hasPipelineContext) {
    return `${subject} pipeline trade-offs`;
  }

  return `${subject} trade-offs`;
};

export const normalizeExtractedTitle = (rawTitle?: string | null): string | undefined => {
  if (!rawTitle) {
    return undefined;
  }

  const normalized = rawTitle.replace(/[\s\u00A0]+/gu, " ").trim();
  if (!normalized) {
    return undefined;
  }

  for (const pattern of QUOTED_TITLE_PATTERNS) {
    const match = normalized.match(pattern);
    const quoted = match?.[1] ? cleanTitle(match[1]) : "";
    if (quoted) {
      return quoted;
    }
  }

  if (SOCIAL_WRAPPER_PATTERN.test(normalized)) {
    return undefined;
  }

  const cleaned = cleanTitle(normalized);
  return cleaned || undefined;
};

export const sanitizeGeneratedTitle = (rawTitle?: string | null): string | null => {
  const normalized = normalizeExtractedTitle(rawTitle);
  return normalized ?? null;
};

export const finalizeGeneratedTitle = (
  rawTitle: string | null | undefined,
  sourceSnippet: string,
): string | null => {
  const normalized = sanitizeGeneratedTitle(rawTitle);
  if (!normalized) {
    return null;
  }

  const wordCount = normalized.split(/\s+/u).filter(Boolean).length;
  const isLongFallback = wordCount >= 6;
  const hasTradeOffWord = /\btrade[\s-]?offs?\b/iu.test(normalized);

  if (!isLongFallback || hasTradeOffWord || !COMPARISON_INTENT_PATTERN.test(sourceSnippet)) {
    return normalized;
  }

  return inferComparisonTitle(normalized, sourceSnippet);
};
