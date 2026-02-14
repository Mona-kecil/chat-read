export type ChunkWithPage = {
  order: number;
  text: string;
  pageIndex: number;
  pageChunkIndex?: number;
  pageChunkCount?: number;
};

export type ChunkNeighbor = ChunkWithPage & {
  position: "prev" | "next";
  distance: number;
  crossPage: boolean;
};

export type ChunkWindow = {
  target: ChunkWithPage;
  prev: ChunkNeighbor[];
  next: ChunkNeighbor[];
};

const buildFallbackNeighbors = (
  chunks: ChunkWithPage[],
  index: number,
  radius: number,
): { prev: ChunkNeighbor[]; next: ChunkNeighbor[] } => {
  const prev: ChunkNeighbor[] = [];
  const next: ChunkNeighbor[] = [];

  for (let cursor = index - 1; cursor >= 0 && prev.length < radius; cursor -= 1) {
    const chunk = chunks[cursor];
    if (!chunk) {
      continue;
    }
    prev.unshift({
      ...chunk,
      position: "prev",
      distance: index - cursor,
      crossPage: true,
    });
  }

  for (let cursor = index + 1; cursor < chunks.length && next.length < radius; cursor += 1) {
    const chunk = chunks[cursor];
    if (!chunk) {
      continue;
    }
    next.push({
      ...chunk,
      position: "next",
      distance: cursor - index,
      crossPage: true,
    });
  }

  return { prev, next };
};

export const buildChunkWindow = (
  chunks: ChunkWithPage[],
  index: number,
  radius = 3,
  mode: "page-aware" | "global" = "page-aware",
): ChunkWindow => {
  const target = chunks[index];
  if (!target) {
    throw new Error(`Missing target chunk at index ${index}`);
  }

  if (mode === "global") {
    const fallback = buildFallbackNeighbors(chunks, index, radius);
    return { target, prev: fallback.prev, next: fallback.next };
  }

  const samePagePrev: ChunkNeighbor[] = [];
  const samePageNext: ChunkNeighbor[] = [];

  for (let cursor = index - 1; cursor >= 0 && samePagePrev.length < radius; cursor -= 1) {
    const chunk = chunks[cursor];
    if (!chunk || chunk.pageIndex !== target.pageIndex) {
      continue;
    }
    samePagePrev.unshift({
      ...chunk,
      position: "prev",
      distance: index - cursor,
      crossPage: false,
    });
  }

  for (
    let cursor = index + 1;
    cursor < chunks.length && samePageNext.length < radius;
    cursor += 1
  ) {
    const chunk = chunks[cursor];
    if (!chunk || chunk.pageIndex !== target.pageIndex) {
      continue;
    }
    samePageNext.push({
      ...chunk,
      position: "next",
      distance: cursor - index,
      crossPage: false,
    });
  }

  if (samePagePrev.length === radius && samePageNext.length === radius) {
    return { target, prev: samePagePrev, next: samePageNext };
  }

  const fallback = buildFallbackNeighbors(chunks, index, radius);

  const prev = [...samePagePrev];
  for (const neighbor of fallback.prev) {
    if (prev.length >= radius) {
      break;
    }
    if (neighbor.order === target.order || prev.some((item) => item.order === neighbor.order)) {
      continue;
    }
    prev.unshift({ ...neighbor, crossPage: neighbor.pageIndex !== target.pageIndex });
  }

  const next = [...samePageNext];
  for (const neighbor of fallback.next) {
    if (next.length >= radius) {
      break;
    }
    if (neighbor.order === target.order || next.some((item) => item.order === neighbor.order)) {
      continue;
    }
    next.push({ ...neighbor, crossPage: neighbor.pageIndex !== target.pageIndex });
  }

  return { target, prev, next };
};

export const buildContextSignature = (window: ChunkWindow): string =>
  [
    ...window.prev.map(
      (chunk) =>
        `p:${chunk.order}:page=${chunk.pageIndex}:cross=${chunk.crossPage ? "1" : "0"}:${chunk.text}`,
    ),
    `t:${window.target.order}:page=${window.target.pageIndex}:${window.target.text}`,
    ...window.next.map(
      (chunk) =>
        `n:${chunk.order}:page=${chunk.pageIndex}:cross=${chunk.crossPage ? "1" : "0"}:${chunk.text}`,
    ),
  ].join("\n---\n");
