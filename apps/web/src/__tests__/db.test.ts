import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  db,
  saveOcrSession,
  fetchDocumentByUuid,
  toggleBubbleBookmark,
  softDeleteBubble,
  restoreBubble,
  listBookmarkedBubbles,
  listDeletedBubbles,
  deleteDocumentByUuid,
  clearOcrHistory,
  type SaveOcrSessionInput,
} from "@/lib/db";

const makeSaveInput = (overrides?: Partial<SaveOcrSessionInput>): SaveOcrSessionInput => ({
  sourceType: "file",
  sourceName: "test.pdf",
  model: "pixtral",
  pages: [{ index: 0, markdown: "Hello world." }],
  chunks: [
    { order: 1, text: "Hello world. This is a test sentence." },
    { order: 2, text: "Another chunk of text here." },
  ],
  textLength: 100,
  ...overrides,
});

beforeEach(async () => {
  await db.open();
  await db.transaction("rw", db.documents, db.pages, db.chunks, db.bubbles, async () => {
    await db.documents.clear();
    await db.pages.clear();
    await db.chunks.clear();
    await db.bubbles.clear();
  });
});

afterEach(async () => {
  await db.close();
});

describe("saveOcrSession", () => {
  it("should create bubbles from chunks", async () => {
    const result = await saveOcrSession(makeSaveInput());

    const bubbles = await db.bubbles.where("documentId").equals(result.id).sortBy("order");

    expect(bubbles.length).toBeGreaterThan(0);
    for (const bubble of bubbles) {
      expect(bubble.documentId).toBe(result.id);
      expect(bubble.chunkId).toBeDefined();
      expect(bubble.bookmarkedAt).toBeNull();
      expect(bubble.deletedAt).toBeNull();
      expect(bubble.text.length).toBeGreaterThan(0);
      expect(bubble.charCount).toBe(bubble.text.length);
    }
  });
});

describe("fetchDocumentByUuid", () => {
  it("should return contentTitle from stored document", async () => {
    const result = await saveOcrSession(makeSaveInput({ contentTitle: "Saved Title" }));
    const doc = await db.documents.get(result.id);

    const details = await fetchDocumentByUuid(doc!.uuid);

    expect(details!.document.contentTitle).toBe("Saved Title");
  });

  it("should return bubbles sorted by order", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const doc = await db.documents.get(result.id);

    const details = await fetchDocumentByUuid(doc!.uuid);

    expect(details).not.toBeNull();
    expect(details!.bubbles.length).toBeGreaterThan(0);
    for (let i = 1; i < details!.bubbles.length; i++) {
      expect(details!.bubbles[i]!.order).toBeGreaterThan(details!.bubbles[i - 1]!.order);
    }
  });
});

describe("toggleBubbleBookmark", () => {
  it("should set bookmarkedAt when not bookmarked", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const bubbles = await db.bubbles.where("documentId").equals(result.id).toArray();
    const bubble = bubbles[0]!;

    const updated = await toggleBubbleBookmark(bubble.id);

    expect(updated).not.toBeNull();
    expect(updated!.bookmarkedAt).not.toBeNull();
    expect(typeof updated!.bookmarkedAt).toBe("string");
  });

  it("should clear bookmarkedAt when already bookmarked", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const bubbles = await db.bubbles.where("documentId").equals(result.id).toArray();
    const bubble = bubbles[0]!;

    await toggleBubbleBookmark(bubble.id);
    const updated = await toggleBubbleBookmark(bubble.id);

    expect(updated).not.toBeNull();
    expect(updated!.bookmarkedAt).toBeNull();
  });
});

describe("softDeleteBubble", () => {
  it("should set deletedAt", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const bubbles = await db.bubbles.where("documentId").equals(result.id).toArray();
    const bubble = bubbles[0]!;

    const deleted = await softDeleteBubble(bubble.id);

    expect(deleted).toBe(true);
    const updated = await db.bubbles.get(bubble.id);
    expect(updated!.deletedAt).not.toBeNull();
  });
});

describe("restoreBubble", () => {
  it("should clear deletedAt", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const bubbles = await db.bubbles.where("documentId").equals(result.id).toArray();
    const bubble = bubbles[0]!;

    await softDeleteBubble(bubble.id);
    const restored = await restoreBubble(bubble.id);

    expect(restored).toBe(true);
    const updated = await db.bubbles.get(bubble.id);
    expect(updated!.deletedAt).toBeNull();
  });
});

describe("listBookmarkedBubbles", () => {
  it("should return only bookmarked bubbles for a document", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const bubbles = await db.bubbles.where("documentId").equals(result.id).toArray();

    await toggleBubbleBookmark(bubbles[0]!.id);

    const bookmarked = await listBookmarkedBubbles(result.id);

    expect(bookmarked.length).toBe(1);
    expect(bookmarked[0]!.id).toBe(bubbles[0]!.id);
  });
});

describe("listDeletedBubbles", () => {
  it("should return only soft-deleted bubbles for a document", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const bubbles = await db.bubbles.where("documentId").equals(result.id).toArray();

    await softDeleteBubble(bubbles[0]!.id);

    const deleted = await listDeletedBubbles(result.id);

    expect(deleted.length).toBe(1);
    expect(deleted[0]!.id).toBe(bubbles[0]!.id);
  });
});

describe("deleteDocumentByUuid", () => {
  it("should also delete bubbles for the document", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const doc = await db.documents.get(result.id);

    await deleteDocumentByUuid(doc!.uuid);

    const bubbles = await db.bubbles.where("documentId").equals(result.id).toArray();
    expect(bubbles.length).toBe(0);
  });
});

describe("saveOcrSession contentTitle", () => {
  it("should store contentTitle when explicitly provided", async () => {
    const result = await saveOcrSession(makeSaveInput({ contentTitle: "My Custom Title" }));

    const doc = await db.documents.get(result.id);
    expect(doc!.contentTitle).toBe("My Custom Title");
  });

  it("should extract first markdown heading as contentTitle when not provided", async () => {
    const result = await saveOcrSession(
      makeSaveInput({
        pages: [{ index: 0, markdown: "Some intro\n\n## Chapter One\n\nBody text" }],
      }),
    );

    const doc = await db.documents.get(result.id);
    expect(doc!.contentTitle).toBe("Chapter One");
  });

  it("should leave contentTitle undefined when no heading found", async () => {
    const result = await saveOcrSession(
      makeSaveInput({
        pages: [{ index: 0, markdown: "Just plain text without headings." }],
      }),
    );

    const doc = await db.documents.get(result.id);
    expect(doc!.contentTitle).toBeUndefined();
  });
});

describe("updateDocumentTitle", () => {
  it("should update contentTitle on an existing document", async () => {
    const result = await saveOcrSession(makeSaveInput());
    const doc = await db.documents.get(result.id);
    expect(doc!.contentTitle).toBeUndefined();

    const { updateDocumentTitle } = await import("@/lib/db");
    const updated = await updateDocumentTitle(result.id, "LLM Generated Title");

    expect(updated).toBe(true);
    const refreshed = await db.documents.get(result.id);
    expect(refreshed!.contentTitle).toBe("LLM Generated Title");
  });

  it("should return false for non-existent document", async () => {
    const { updateDocumentTitle } = await import("@/lib/db");
    const updated = await updateDocumentTitle("non-existent-id", "Title");
    expect(updated).toBe(false);
  });
});

describe("clearOcrHistory", () => {
  it("should also clear bubbles", async () => {
    await saveOcrSession(makeSaveInput());

    await clearOcrHistory();

    const bubbles = await db.bubbles.toArray();
    expect(bubbles.length).toBe(0);
  });
});
