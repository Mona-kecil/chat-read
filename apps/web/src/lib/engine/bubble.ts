import { splitIntoSentences } from "./split";

const CONTINUATION_WORDS = new Set(["and", "but", "or", "because", "when"]);
const TARGET_MIN_CHARS = 180;
const TARGET_MAX_CHARS = 320;
const HARD_MAX_CHARS = 420;
const ORPHAN_MIN_CHARS = 90;

export const isLikelyHeadingLine = (line: string) => /^#{1,6}\s+/.test(line.trim());

export const isSalutationLine = (line: string) =>
  /^(dear|hi|hello)\b/i.test(line.trim()) || line.trim().endsWith(",");

export const isStandaloneTitleLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) {
    return false;
  }
  if (isLikelyHeadingLine(trimmed) || isSalutationLine(trimmed)) {
    return true;
  }
  return /^[A-Z][A-Za-z0-9&'()\- ]+$/.test(trimmed) && !/[.!?]$/.test(trimmed);
};

export const splitWordsByLimit = (line: string, limit: number) => {
  const words = line.split(/\s+/g).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
    }
    if (word.length > limit) {
      let cursor = 0;
      while (cursor < word.length) {
        chunks.push(word.slice(cursor, cursor + limit));
        cursor += limit;
      }
      current = "";
    } else {
      current = word;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
};

export const shouldPreferAttach = (sentence: string) => {
  const firstWord = sentence.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return CONTINUATION_WORDS.has(firstWord) || /^[a-z]/.test(sentence.trim());
};

export const buildTextBlocks = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const blocks: string[] = [];
  let current: string[] = [];
  const pushCurrent = () => {
    const value = current.join("\n").trim();
    if (value) {
      blocks.push(value);
    }
    current = [];
  };

  const lines = normalized.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      pushCurrent();
      continue;
    }

    if (isLikelyHeadingLine(trimmed) || isStandaloneTitleLine(trimmed)) {
      pushCurrent();
      blocks.push(trimmed);
      continue;
    }

    if (isSalutationLine(trimmed)) {
      pushCurrent();
      blocks.push(trimmed);
      continue;
    }

    const previous = current[current.length - 1]?.trim() ?? "";
    const startsLowercase = /^[a-z]/.test(trimmed);
    const previousEndsSentence = /[.!?]"?$/.test(previous);
    if (previous && previousEndsSentence && !startsLowercase) {
      pushCurrent();
    }
    current.push(trimmed);
  }

  pushCurrent();
  return blocks;
};

export const splitTextForBubbles = (text: string, hardMax = HARD_MAX_CHARS) => {
  const blocks = buildTextBlocks(text);
  if (!blocks.length) {
    return [];
  }

  const bubbles: string[] = [];

  for (const block of blocks) {
    if (isLikelyHeadingLine(block) || isStandaloneTitleLine(block) || isSalutationLine(block)) {
      bubbles.push(block.trim());
      continue;
    }

    const flatBlock = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    const sentenceUnits = splitIntoSentences(flatBlock)
      .map((sentence) => sentence.text.trim())
      .filter(Boolean);
    const units = sentenceUnits.length ? sentenceUnits : [flatBlock];

    let current = "";
    for (const unit of units) {
      const candidate = current ? `${current} ${unit}` : unit;
      const preferAttach = shouldPreferAttach(unit);

      if (candidate.length <= hardMax && (current.length < TARGET_MAX_CHARS || preferAttach)) {
        current = candidate;
        continue;
      }

      if (current) {
        bubbles.push(current);
      }
      if (unit.length <= hardMax) {
        current = unit;
      } else {
        const pieces = splitWordsByLimit(unit, hardMax);
        if (pieces.length > 1) {
          bubbles.push(...pieces.slice(0, -1));
          current = pieces[pieces.length - 1] ?? "";
        } else {
          current = unit;
        }
      }
    }

    if (current.trim()) {
      bubbles.push(current);
    }
  }

  const compacted: string[] = [];
  for (const bubble of bubbles) {
    const value = bubble.trim();
    if (!value) {
      continue;
    }
    const previous = compacted[compacted.length - 1];
    if (
      previous &&
      value.length < ORPHAN_MIN_CHARS &&
      !isLikelyHeadingLine(value) &&
      !isStandaloneTitleLine(value) &&
      !isSalutationLine(value) &&
      (previous.length < TARGET_MIN_CHARS || previous.length + 1 + value.length <= hardMax)
    ) {
      compacted[compacted.length - 1] = `${previous} ${value}`;
      continue;
    }
    compacted.push(value);
  }

  return compacted;
};
