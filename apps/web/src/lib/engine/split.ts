export type Sentence = {
  id: number;
  text: string;
  sourceStart: number;
  sourceEnd: number;
};

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "fig",
  "no",
  "vol",
  "al",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

const CLOSING_PUNCTUATION = new Set(['"', "'", "”", "’", ")", "]", "}"]);

const isWhitespace = (value: string) => /\s/.test(value);
const isDigit = (value: string | undefined) => (value ? /\d/.test(value) : false);
const isSentenceEnder = (value: string) => value === "." || value === "?" || value === "!";

const getTokenBefore = (text: string, index: number) => {
  let cursor = index - 1;
  while (cursor >= 0 && !/[A-Za-z0-9]/.test(text[cursor] ?? "")) {
    cursor -= 1;
  }
  let end = cursor;
  while (cursor >= 0 && /[A-Za-z0-9.]/.test(text[cursor] ?? "")) {
    cursor -= 1;
  }
  const token = text.slice(cursor + 1, end + 1);
  return token.trim();
};

const isLikelyAbbreviation = (token: string) => {
  const normalized = token.toLowerCase().replace(/\.$/, "");
  if (ABBREVIATIONS.has(normalized)) {
    return true;
  }
  return /^[A-Z](\.[A-Z])*\.?$/.test(token);
};

const isEllipsis = (text: string, index: number) => {
  if (text[index] !== ".") {
    return false;
  }
  return text[index + 1] === "." || text[index - 1] === ".";
};

const shouldSplitAt = (text: string, index: number) => {
  const char = text[index];
  if (!char || !isSentenceEnder(char)) {
    return false;
  }

  if (char === ".") {
    if (isEllipsis(text, index)) {
      return false;
    }
    if (isDigit(text[index - 1]) && isDigit(text[index + 1])) {
      return false;
    }
    const token = getTokenBefore(text, index);
    if (token && isLikelyAbbreviation(token)) {
      return false;
    }
  }

  const nextChar = text[index + 1];
  if (!nextChar) {
    return true;
  }
  return isWhitespace(nextChar) || CLOSING_PUNCTUATION.has(nextChar);
};

const trimRange = (text: string, start: number, end: number) => {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && isWhitespace(text[trimmedStart] ?? "")) {
    trimmedStart += 1;
  }
  while (trimmedEnd > trimmedStart && isWhitespace(text[trimmedEnd - 1] ?? "")) {
    trimmedEnd -= 1;
  }
  return { trimmedStart, trimmedEnd };
};

export const splitIntoSentences = (text: string): Sentence[] => {
  const sentences: Sentence[] = [];
  const length = text.length;
  let start = 0;

  for (let index = 0; index < length; index += 1) {
    if (!shouldSplitAt(text, index)) {
      continue;
    }

    let end = index + 1;
    while (end < length && CLOSING_PUNCTUATION.has(text[end] ?? "")) {
      end += 1;
    }

    const { trimmedStart, trimmedEnd } = trimRange(text, start, end);
    if (trimmedEnd > trimmedStart) {
      sentences.push({
        id: sentences.length + 1,
        text: text.slice(trimmedStart, trimmedEnd),
        sourceStart: trimmedStart,
        sourceEnd: trimmedEnd,
      });
    }

    start = end;
  }

  if (start < length) {
    const { trimmedStart, trimmedEnd } = trimRange(text, start, length);
    if (trimmedEnd > trimmedStart) {
      sentences.push({
        id: sentences.length + 1,
        text: text.slice(trimmedStart, trimmedEnd),
        sourceStart: trimmedStart,
        sourceEnd: trimmedEnd,
      });
    }
  }

  return sentences;
};
