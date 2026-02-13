import { splitIntoSentences } from "./split";

export type ChunkOptions = {
  minChars?: number;
  maxChars?: number;
  hardMaxChars?: number;
};

export type MarkdownChunk = {
  order: number;
  text: string;
};

type BlockType = "heading" | "list" | "table" | "code" | "paragraph";

type Block = {
  type: BlockType;
  text: string;
};

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  minChars: 600,
  maxChars: 1400,
  hardMaxChars: 2000,
};

const normalizeMarkdown = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const isHeading = (line: string) => /^\s{0,3}#{1,6}\s+/.test(line);
const isListLine = (line: string) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line);
const isTableLine = (line: string) => line.split("|").length - 1 >= 2;
const isCodeFence = (line: string) => line.trim().startsWith("```");

const buildBlocks = (text: string): Block[] => {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let bufferType: BlockType | null = null;
  let inCode = false;

  const flushBuffer = () => {
    if (!bufferType || buffer.length === 0) {
      buffer = [];
      bufferType = null;
      return;
    }
    const chunk = buffer.join("\n").trim();
    if (chunk) {
      blocks.push({ type: bufferType, text: chunk });
    }
    buffer = [];
    bufferType = null;
  };

  for (const line of lines) {
    if (isCodeFence(line)) {
      if (!inCode) {
        flushBuffer();
        bufferType = "code";
      }
      inCode = !inCode;
      buffer.push(line);
      if (!inCode) {
        flushBuffer();
      }
      continue;
    }

    if (inCode) {
      buffer.push(line);
      continue;
    }

    if (!line.trim()) {
      flushBuffer();
      continue;
    }

    if (isHeading(line)) {
      flushBuffer();
      blocks.push({ type: "heading", text: line.trim() });
      continue;
    }

    if (isListLine(line)) {
      if (bufferType !== "list") {
        flushBuffer();
        bufferType = "list";
      }
      buffer.push(line);
      continue;
    }

    if (isTableLine(line)) {
      if (bufferType !== "table") {
        flushBuffer();
        bufferType = "table";
      }
      buffer.push(line);
      continue;
    }

    if (bufferType !== "paragraph") {
      flushBuffer();
      bufferType = "paragraph";
    }
    buffer.push(line);
  }

  flushBuffer();
  return blocks;
};

const splitByLength = (text: string, maxChars: number) => {
  const segments: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    segments.push(text.slice(cursor, cursor + maxChars));
    cursor += maxChars;
  }
  return segments;
};

const splitLargeBlock = (block: Block, maxChars: number) => {
  if (block.type === "paragraph" || block.type === "heading") {
    const sentences = splitIntoSentences(block.text).map((sentence) => sentence.text.trim());
    if (sentences.length > 1) {
      const segments: string[] = [];
      let buffer = "";
      for (const sentence of sentences) {
        if (!sentence) {
          continue;
        }
        const separator = buffer ? " " : "";
        if (buffer.length + separator.length + sentence.length <= maxChars) {
          buffer += separator + sentence;
        } else {
          if (buffer) {
            segments.push(buffer);
          }
          if (sentence.length > maxChars) {
            segments.push(...splitByLength(sentence, maxChars));
            buffer = "";
          } else {
            buffer = sentence;
          }
        }
      }
      if (buffer) {
        segments.push(buffer);
      }
      return segments;
    }
  }

  const lines = block.text.split("\n");
  const segments: string[] = [];
  let buffer = "";
  for (const line of lines) {
    const normalized = line.trimEnd();
    if (!normalized) {
      continue;
    }
    if (normalized.length > maxChars) {
      if (buffer) {
        segments.push(buffer);
        buffer = "";
      }
      segments.push(...splitByLength(normalized, maxChars));
      continue;
    }
    const separator = buffer ? "\n" : "";
    if (buffer.length + separator.length + normalized.length <= maxChars) {
      buffer += separator + normalized;
    } else {
      if (buffer) {
        segments.push(buffer);
      }
      buffer = normalized;
    }
  }
  if (buffer) {
    segments.push(buffer);
  }
  return segments;
};

export const chunkMarkdown = (rawText: string, options?: ChunkOptions): MarkdownChunk[] => {
  const text = normalizeMarkdown(rawText);
  if (!text) {
    return [];
  }

  const { minChars, maxChars, hardMaxChars } = { ...DEFAULT_OPTIONS, ...options };
  const blocks = buildBlocks(text);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = "";
  };

  const appendChunk = (value: string) => {
    if (!current) {
      current = value;
      return;
    }
    current += `\n\n${value}`;
  };

  for (const block of blocks) {
    const blockText = block.text.trim();
    if (!blockText) {
      continue;
    }
    if (blockText.length > maxChars) {
      if (current) {
        pushCurrent();
      }
      const segments = splitLargeBlock(block, maxChars);
      for (const segment of segments) {
        if (!segment.trim()) {
          continue;
        }
        if (!current) {
          current = segment;
          continue;
        }
        if (current.length + 2 + segment.length <= maxChars) {
          appendChunk(segment);
        } else {
          pushCurrent();
          current = segment;
        }
      }
      continue;
    }

    if (!current) {
      current = blockText;
      continue;
    }

    if (current.length + 2 + blockText.length <= maxChars) {
      appendChunk(blockText);
      continue;
    }

    if (current.length >= minChars) {
      pushCurrent();
      current = blockText;
      continue;
    }

    if (current.length + 2 + blockText.length <= hardMaxChars) {
      appendChunk(blockText);
    } else {
      pushCurrent();
      current = blockText;
    }
  }

  if (current) {
    pushCurrent();
  }

  return chunks.map((chunk, index) => ({ order: index + 1, text: chunk }));
};
