import Dexie, { type Table } from "dexie";
import { splitTextForBubbles } from "@/lib/engine/bubble";

export type DocumentRecord = {
  id: string;
  uuid: string;
  createdAt: string;
  pinnedAt?: string | null;
  lastOpenedAt?: string | null;
  sourceType: "file" | "url" | "paste";
  sourceName?: string;
  sourceUrl?: string;
  model: string;
  pageCount: number;
  textLength: number;
  chunkCount: number;
  contentTitle?: string;
};

export type OcrPageRecord = {
  id: string;
  documentId: string;
  index: number;
  markdown: string;
  images: string[];
};

export type ChunkRecord = {
  id: string;
  documentId: string;
  order: number;
  text: string;
  charCount: number;
};

export type BubbleRecord = {
  id: string;
  documentId: string;
  chunkId: string;
  order: number;
  text: string;
  charCount: number;
  bookmarkedAt: string | null;
  deletedAt: string | null;
};

export type OcrPageInput = {
  index: number;
  markdown: string;
  images?: string[];
};

export type ChunkInput = {
  order: number;
  text: string;
};

export type SaveOcrSessionInput = {
  sourceType: DocumentRecord["sourceType"];
  sourceName?: string;
  sourceUrl?: string;
  model: string;
  pages: OcrPageInput[];
  chunks: ChunkInput[];
  textLength: number;
  contentTitle?: string;
};

export type SaveOcrSessionResult = {
  id: string;
  uuid: string;
};

class ChatReadDB extends Dexie {
  documents!: Table<DocumentRecord, string>;
  pages!: Table<OcrPageRecord, string>;
  chunks!: Table<ChunkRecord, string>;
  bubbles!: Table<BubbleRecord, string>;

  constructor() {
    super("chat-read");
    this.version(1).stores({
      documents: "id, createdAt, sourceType, sourceUrl, sourceName",
      pages: "id, documentId, index",
      chunks: "id, documentId, order",
    });

    this.version(2)
      .stores({
        documents: "id, uuid, createdAt, sourceType, sourceUrl, sourceName",
        pages: "id, documentId, index",
        chunks: "id, documentId, order",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("documents")
          .toCollection()
          .modify((doc) => {
            if (!doc.uuid) {
              doc.uuid = crypto.randomUUID();
            }
            if (!doc.id) {
              doc.id = crypto.randomUUID();
            }
          });
      });

    this.version(3)
      .stores({
        documents: "id, uuid, createdAt, sourceType, sourceUrl, sourceName",
        pages: "id, documentId, index",
        chunks: "id, documentId, order",
        bubbles:
          "id, documentId, chunkId, order, [documentId+order], [documentId+bookmarkedAt], [documentId+deletedAt]",
      })
      .upgrade(async (transaction) => {
        const chunks = await transaction.table("chunks").toArray();
        const bubbleRecords: BubbleRecord[] = [];
        const chunksByDocument = new Map<string, typeof chunks>();

        for (const chunk of chunks) {
          const existing = chunksByDocument.get(chunk.documentId) ?? [];
          existing.push(chunk);
          chunksByDocument.set(chunk.documentId, existing);
        }

        for (const docChunks of chunksByDocument.values()) {
          docChunks.sort((a, b) => a.order - b.order);
          let bubbleOrder = 1;
          for (const chunk of docChunks) {
            const bubbleTexts = splitTextForBubbles(chunk.text);
            for (const text of bubbleTexts) {
              bubbleRecords.push({
                id: crypto.randomUUID(),
                documentId: chunk.documentId,
                chunkId: chunk.id,
                order: bubbleOrder,
                text,
                charCount: text.length,
                bookmarkedAt: null,
                deletedAt: null,
              });
              bubbleOrder += 1;
            }
          }
        }

        if (bubbleRecords.length > 0) {
          await transaction.table("bubbles").bulkAdd(bubbleRecords);
        }
      });

    this.version(4)
      .stores({
        documents: "id, uuid, createdAt, sourceType, sourceUrl, sourceName",
        pages: "id, documentId, index",
        chunks: "id, documentId, order",
        bubbles:
          "id, documentId, chunkId, order, [documentId+order], [documentId+bookmarkedAt], [documentId+deletedAt]",
      })
      .upgrade(async (transaction) => {
        const pages = await transaction.table("pages").toArray();
        const titleByDocId = new Map<string, string>();

        for (const page of pages) {
          if (titleByDocId.has(page.documentId)) {
            continue;
          }
          const match = (page.markdown as string).match(/^#{1,3}\s+(.+)$/m);
          if (match?.[1]) {
            titleByDocId.set(page.documentId, match[1].trim());
          }
        }

        await transaction
          .table("documents")
          .toCollection()
          .modify((doc) => {
            const title = titleByDocId.get(doc.id);
            if (title) {
              doc.contentTitle = title;
            }
          });
      });

    this.version(5)
      .stores({
        documents: "id, uuid, createdAt, lastOpenedAt, pinnedAt, sourceType, sourceUrl, sourceName",
        pages: "id, documentId, index",
        chunks: "id, documentId, order",
        bubbles:
          "id, documentId, chunkId, order, [documentId+order], [documentId+bookmarkedAt], [documentId+deletedAt]",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("documents")
          .toCollection()
          .modify((doc) => {
            if (typeof doc.pinnedAt === "undefined") {
              doc.pinnedAt = null;
            }
            if (typeof doc.lastOpenedAt === "undefined") {
              doc.lastOpenedAt = doc.createdAt;
            }
          });
      });
  }
}

export const db = new ChatReadDB();

const extractContentTitle = (pages: OcrPageInput[]): string | undefined => {
  for (const page of pages) {
    const match = page.markdown.match(/^#{1,3}\s+(.+)$/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
};

export const saveOcrSession = async (input: SaveOcrSessionInput): Promise<SaveOcrSessionResult> => {
  const id = crypto.randomUUID();
  const uuid = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { sourceType, sourceName, sourceUrl, model, pages, chunks, textLength } = input;
  const contentTitle = input.contentTitle ?? extractContentTitle(pages);

  const pageRecords = pages.map((page) => ({
    id: crypto.randomUUID(),
    documentId: id,
    index: page.index,
    markdown: page.markdown,
    images: page.images ?? [],
  }));

  const chunkRecords = chunks.map((chunk) => ({
    id: crypto.randomUUID(),
    documentId: id,
    order: chunk.order,
    text: chunk.text,
    charCount: chunk.text.length,
  }));

  // This can be CPU-heavy for large documents; keep it outside the IndexedDB transaction.
  const sortedChunks = [...chunkRecords].sort((a, b) => a.order - b.order);
  let bubbleOrder = 1;
  const bubbleRecords: BubbleRecord[] = [];
  for (const chunk of sortedChunks) {
    const bubbleTexts = splitTextForBubbles(chunk.text);
    for (const text of bubbleTexts) {
      bubbleRecords.push({
        id: crypto.randomUUID(),
        documentId: id,
        chunkId: chunk.id,
        order: bubbleOrder,
        text,
        charCount: text.length,
        bookmarkedAt: null,
        deletedAt: null,
      });
      bubbleOrder += 1;
    }
  }

  await db.transaction("rw", db.documents, db.pages, db.chunks, db.bubbles, async () => {
    await db.documents.add({
      id,
      uuid,
      createdAt,
      pinnedAt: null,
      lastOpenedAt: createdAt,
      sourceType,
      sourceName,
      sourceUrl,
      model,
      pageCount: pages.length,
      textLength,
      chunkCount: chunks.length,
      contentTitle,
    });

    await db.pages.bulkAdd(pageRecords);
    await db.chunks.bulkAdd(chunkRecords);
    await db.bubbles.bulkAdd(bubbleRecords);
  });

  return { id, uuid };
};

export type OcrDocumentDetails = {
  document: DocumentRecord;
  pages: OcrPageRecord[];
  chunks: ChunkRecord[];
  bubbles: BubbleRecord[];
};

export const fetchDocumentByUuid = async (uuid: string): Promise<OcrDocumentDetails | null> => {
  const document = await db.documents.where("uuid").equals(uuid).first();
  if (!document) {
    return null;
  }

  const [pages, chunks, bubbles] = await Promise.all([
    db.pages.where("documentId").equals(document.id).sortBy("index"),
    db.chunks.where("documentId").equals(document.id).sortBy("order"),
    db.bubbles.where("documentId").equals(document.id).sortBy("order"),
  ]);

  return { document, pages, chunks, bubbles };
};

export const listDocuments = async (): Promise<DocumentRecord[]> =>
  (await db.documents.orderBy("createdAt").reverse().toArray()).sort((a, b) => {
    const aPinned = a.pinnedAt ? 1 : 0;
    const bPinned = b.pinnedAt ? 1 : 0;
    if (aPinned !== bPinned) {
      return bPinned - aPinned;
    }
    const aOpened = a.lastOpenedAt ?? a.createdAt;
    const bOpened = b.lastOpenedAt ?? b.createdAt;
    return bOpened.localeCompare(aOpened);
  });

export const toggleDocumentPinnedByUuid = async (uuid: string): Promise<DocumentRecord | null> => {
  const document = await db.documents.where("uuid").equals(uuid).first();
  if (!document) {
    return null;
  }

  const pinnedAt = document.pinnedAt ? null : new Date().toISOString();
  await db.documents.update(document.id, { pinnedAt });
  return { ...document, pinnedAt };
};

export const touchDocumentOpenedByUuid = async (uuid: string): Promise<DocumentRecord | null> => {
  const document = await db.documents.where("uuid").equals(uuid).first();
  if (!document) {
    return null;
  }

  const lastOpenedAt = new Date().toISOString();
  await db.documents.update(document.id, { lastOpenedAt });
  return { ...document, lastOpenedAt };
};

export const deleteDocumentByUuid = async (uuid: string): Promise<boolean> => {
  const document = await db.documents.where("uuid").equals(uuid).first();
  if (!document) {
    return false;
  }

  await db.transaction("rw", db.documents, db.pages, db.chunks, db.bubbles, async () => {
    await db.pages.where("documentId").equals(document.id).delete();
    await db.chunks.where("documentId").equals(document.id).delete();
    await db.bubbles.where("documentId").equals(document.id).delete();
    await db.documents.delete(document.id);
  });

  return true;
};

export const clearOcrHistory = async (): Promise<void> => {
  await db.transaction("rw", db.documents, db.pages, db.chunks, db.bubbles, async () => {
    await db.documents.clear();
    await db.pages.clear();
    await db.chunks.clear();
    await db.bubbles.clear();
  });
};

export const updateDocumentTitle = async (id: string, contentTitle: string): Promise<boolean> => {
  const count = await db.documents.update(id, { contentTitle });
  return count > 0;
};

export const toggleBubbleBookmark = async (bubbleId: string): Promise<BubbleRecord | null> => {
  const bubble = await db.bubbles.get(bubbleId);
  if (!bubble) {
    return null;
  }
  const bookmarkedAt = bubble.bookmarkedAt ? null : new Date().toISOString();
  await db.bubbles.update(bubbleId, { bookmarkedAt });
  return { ...bubble, bookmarkedAt };
};

export const softDeleteBubble = async (bubbleId: string): Promise<boolean> => {
  const bubble = await db.bubbles.get(bubbleId);
  if (!bubble) {
    return false;
  }

  // If the user deletes a bubble, it should no longer show up in bookmarks.
  await db.bubbles.update(bubbleId, {
    deletedAt: new Date().toISOString(),
    bookmarkedAt: null,
  });
  return true;
};

export const restoreBubble = async (bubbleId: string): Promise<boolean> => {
  const bubble = await db.bubbles.get(bubbleId);
  if (!bubble) {
    return false;
  }
  await db.bubbles.update(bubbleId, { deletedAt: null });
  return true;
};

export const listBookmarkedBubbles = async (documentId: string): Promise<BubbleRecord[]> => {
  const all = await db.bubbles.where("documentId").equals(documentId).toArray();
  return all.filter((b) => b.bookmarkedAt !== null && b.deletedAt === null);
};

export const listDeletedBubbles = async (documentId: string): Promise<BubbleRecord[]> => {
  const all = await db.bubbles.where("documentId").equals(documentId).toArray();
  return all.filter((b) => b.deletedAt !== null);
};
