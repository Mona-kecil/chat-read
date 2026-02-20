export const TITLE_GENERATION_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";
export const TITLE_EXTRACTOR_SYSTEM_PROMPT =
  "You are a title extractor. Return ONLY the canonical document title text. If the snippet contains social/page wrappers (author/platform/title), discard wrapper text and keep only the quoted or clearly labeled title phrase. If no clear title exists, output the main topic in 2-5 words. No quotes, no trailing punctuation, no explanation.";
