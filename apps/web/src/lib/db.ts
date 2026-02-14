import Dexie, { type Table } from "dexie";

export type DocumentRecord = {
  id: string;
  uuid: string;
  createdAt: string;
  sourceType: "file" | "url" | "paste";
  sourceName?: string;
  sourceUrl?: string;
  model: string;
  pageCount: number;
  textLength: number;
  chunkCount: number;
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
};

export type SaveOcrSessionResult = {
  id: string;
  uuid: string;
};

class ChatReadDB extends Dexie {
  documents!: Table<DocumentRecord, string>;
  pages!: Table<OcrPageRecord, string>;
  chunks!: Table<ChunkRecord, string>;

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
  }
}

export const db = new ChatReadDB();

export const saveOcrSession = async (input: SaveOcrSessionInput): Promise<SaveOcrSessionResult> => {
  const id = crypto.randomUUID();
  const uuid = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { sourceType, sourceName, sourceUrl, model, pages, chunks, textLength } = input;

  await db.transaction("rw", db.documents, db.pages, db.chunks, async () => {
    await db.documents.add({
      id,
      uuid,
      createdAt,
      sourceType,
      sourceName,
      sourceUrl,
      model,
      pageCount: pages.length,
      textLength,
      chunkCount: chunks.length,
    });

    await db.pages.bulkAdd(
      pages.map((page) => ({
        id: crypto.randomUUID(),
        documentId: id,
        index: page.index,
        markdown: page.markdown,
        images: page.images ?? [],
      })),
    );

    await db.chunks.bulkAdd(
      chunks.map((chunk) => ({
        id: crypto.randomUUID(),
        documentId: id,
        order: chunk.order,
        text: chunk.text,
        charCount: chunk.text.length,
      })),
    );
  });

  return { id, uuid };
};

export type OcrDocumentDetails = {
  document: DocumentRecord;
  pages: OcrPageRecord[];
  chunks: ChunkRecord[];
};

export const fetchDocumentByUuid = async (uuid: string): Promise<OcrDocumentDetails | null> => {
  const document = await db.documents.where("uuid").equals(uuid).first();
  if (!document) {
    return null;
  }

  const [pages, chunks] = await Promise.all([
    db.pages.where("documentId").equals(document.id).sortBy("index"),
    db.chunks.where("documentId").equals(document.id).sortBy("order"),
  ]);

  return { document, pages, chunks };
};

export const listDocuments = async (): Promise<DocumentRecord[]> =>
  db.documents.orderBy("createdAt").reverse().toArray();

export const deleteDocumentByUuid = async (uuid: string): Promise<boolean> => {
  const document = await db.documents.where("uuid").equals(uuid).first();
  if (!document) {
    return false;
  }

  await db.transaction("rw", db.documents, db.pages, db.chunks, async () => {
    await db.pages.where("documentId").equals(document.id).delete();
    await db.chunks.where("documentId").equals(document.id).delete();
    await db.documents.delete(document.id);
  });

  return true;
};

export const clearOcrHistory = async (): Promise<void> => {
  await db.transaction("rw", db.documents, db.pages, db.chunks, async () => {
    await db.documents.clear();
    await db.pages.clear();
    await db.chunks.clear();
  });
};
