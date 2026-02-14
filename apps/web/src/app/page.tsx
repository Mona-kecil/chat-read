"use client";

import { useEffect, useMemo, useState } from "react";

import { listDocuments, saveOcrSession } from "@/lib/db";
import { chunkMarkdown } from "@/lib/engine";
import type { MarkdownChunk } from "@/lib/engine/chunk";

type OcrRun = {
  id: string;
  label: string;
  status: string;
  text: string;
  images: string[];
  meta?: { model: string; pages: number };
  documentId?: string | null;
  documentUuid?: string | null;
  chunkCount?: number;
  cleanupStats?: {
    total: number;
    kept?: number;
    omitted?: number;
    uncertain?: number;
    lowConfidenceKept?: number;
    llmCalls: number;
    cacheHits: number;
  };
  cleanupWarning?: string;
  error?: string;
};

type OcrImagePayload = { imageBase64?: string | null };
type OcrPagePayload = {
  index?: number;
  markdown?: string;
  images?: OcrImagePayload[];
};

export default function Home() {
  const [wrapText, setWrapText] = useState<boolean>(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [documentUrls, setDocumentUrls] = useState<string>("");
  const [uiMessage, setUiMessage] = useState<string>("");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [runs, setRuns] = useState<OcrRun[]>([]);
  const [history, setHistory] = useState<
    Array<{ id: string; uuid: string; title: string; createdAt: string }>
  >([]);

  const trimmedUrls = useMemo(
    () =>
      documentUrls
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [documentUrls],
  );

  useEffect(() => {
    let isMounted = true;
    listDocuments()
      .then((docs) => {
        if (!isMounted) {
          return;
        }
        setHistory(
          docs.map((doc) => ({
            id: doc.id,
            uuid: doc.uuid,
            title: doc.sourceName ?? doc.sourceUrl ?? "OCR upload",
            createdAt: doc.createdAt,
          })),
        );
      })
      .catch(() => {
        if (isMounted) {
          setHistory([]);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const addRun = (label: string) => {
    const id = crypto.randomUUID();
    setRuns((prev) => [
      {
        id,
        label,
        status: "Uploading to Mistral OCR...",
        text: "",
        images: [],
      },
      ...prev,
    ]);
    return id;
  };

  const updateRun = (id: string, patch: Partial<OcrRun>) => {
    setRuns((prev) => prev.map((run) => (run.id === id ? { ...run, ...patch } : run)));
  };

  const finalizeRun = (id: string, patch: Partial<OcrRun>) => {
    updateRun(id, { status: "OCR complete", ...patch });
  };

  const failRun = (id: string, error: string) => {
    updateRun(id, { status: "OCR failed", error });
  };

  const buildErrorMessage = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (value instanceof Error && value.message) {
      return value.message;
    }
    return "OCR failed. Please check the input and try again.";
  };

  const runOcrRequest = async ({
    file,
    url,
    sourceType,
    label,
  }: {
    file?: File;
    url?: string;
    sourceType: "file" | "url" | "paste";
    label: string;
  }) => {
    const runId = addRun(label);
    setUiMessage("");
    setPendingCount((count) => count + 1);

    try {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      }
      if (url) {
        formData.append("url", url);
      }
      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        failRun(runId, buildErrorMessage(data.error));
        return;
      }
      const pages = (data.pages ?? []) as OcrPagePayload[];
      const combined = pages.map((page: { markdown?: string }) => page.markdown ?? "").join("\n\n");
      const rawText = combined.trim();
      const images = pages
        .flatMap((page: { images?: Array<{ imageBase64?: string | null }> }) => page.images ?? [])
        .map((image) => image.imageBase64)
        .filter((image): image is string => Boolean(image));
      const chunks =
        (data.chunks as MarkdownChunk[] | undefined)?.filter((chunk): chunk is MarkdownChunk =>
          Boolean(chunk?.text && chunk?.order),
        ) ?? chunkMarkdown(rawText);
      const cleanedText = chunks
        .map((chunk) => chunk.text)
        .join("\n\n")
        .trim();
      const savedDocument = await saveOcrSession({
        sourceType,
        sourceName: file?.name,
        sourceUrl: sourceType === "url" ? url?.trim() || undefined : undefined,
        model: data.model ?? "mistral-ocr-latest",
        pages: pages.map((page: OcrPagePayload, index: number) => ({
          index: page.index ?? index,
          markdown: page.markdown ?? "",
          images: (page.images ?? [])
            .map((image) => image.imageBase64)
            .filter((image): image is string => Boolean(image)),
        })),
        chunks,
        textLength: cleanedText.length,
      });
      finalizeRun(runId, {
        text: cleanedText,
        images,
        meta: { model: data.model ?? "mistral-ocr-latest", pages: pages.length },
        chunkCount: chunks.length,
        cleanupStats: data.cleanupStats,
        cleanupWarning: typeof data.cleanupWarning === "string" ? data.cleanupWarning : undefined,
        documentId: savedDocument.id,
        documentUuid: savedDocument.uuid,
        error: undefined,
      });
      setHistory((prev) => [
        {
          id: savedDocument.id,
          uuid: savedDocument.uuid,
          title: file?.name ?? (sourceType === "url" ? url?.trim() || "OCR upload" : "OCR upload"),
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (error) {
      failRun(runId, buildErrorMessage(error));
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData.items;
    const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      setUiMessage("Clipboard does not contain an image.");
      return;
    }
    const file = imageItem.getAsFile();
    if (!file) {
      setUiMessage("Unable to read the pasted image.");
      return;
    }
    event.preventDefault();
    void runOcrRequest({ file, sourceType: "paste", label: "Pasted image" });
  };

  const isSupportedFile = (file: File) =>
    file.type.startsWith("image/") || file.type === "application/pdf" || !file.type;

  const handleProcessFiles = async () => {
    if (!selectedFiles.length) {
      setUiMessage("Select one or more files to run OCR.");
      return;
    }
    setUiMessage("");
    for (const file of selectedFiles) {
      if (!isSupportedFile(file)) {
        const runId = addRun(`File: ${file.name}`);
        failRun(runId, "Unsupported file type. Use images or PDFs.");
        continue;
      }
      await runOcrRequest({ file, sourceType: "file", label: `File: ${file.name}` });
    }
  };

  const handleProcessUrls = async () => {
    if (!trimmedUrls.length) {
      setUiMessage("Add one or more https URLs to run OCR.");
      return;
    }
    setUiMessage("");
    for (const url of trimmedUrls) {
      if (!url.startsWith("https://")) {
        const runId = addRun(`URL: ${url}`);
        failRun(runId, "URL must start with https://");
        continue;
      }
      await runOcrRequest({ url, sourceType: "url", label: `URL: ${url}` });
    }
  };

  const totalRuns = runs.length;
  const isProcessing = pendingCount > 0;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Content Studio Engine
        </p>
        <h1 className="text-2xl font-semibold">Mistral OCR Evaluation</h1>
        <p className="text-sm text-muted-foreground">
          Local demo of Mistral OCR output before any polishing.
        </p>
      </header>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold">Mistral OCR Prototype</h2>
        <p className="text-xs text-muted-foreground">
          Upload images or PDFs, paste an image, or run OCR from https URLs. Each input is stored
          locally after OCR.
        </p>
        <div className="mt-4 grid gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold">Files</p>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(event) =>
                setSelectedFiles(Array.from(event.target.files ?? []).filter(Boolean))
              }
            />
            {selectedFiles.length ? (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedFiles.map((file) => file.name).join(", ")}
              </p>
            ) : null}
            <button
              type="button"
              className="rounded border px-3 py-1 text-xs"
              onClick={handleProcessFiles}
              disabled={isProcessing}
            >
              Run OCR on Files
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold">URLs</p>
            <textarea
              placeholder="https://example.com/doc-1.pdf\nhttps://example.com/doc-2.png"
              className="min-h-[84px] w-full rounded border bg-transparent px-3 py-2 text-sm"
              value={documentUrls}
              onChange={(event) => setDocumentUrls(event.target.value)}
            />
            <button
              type="button"
              className="rounded border px-3 py-1 text-xs"
              onClick={handleProcessUrls}
              disabled={isProcessing}
            >
              Run OCR on URLs
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold">Paste</p>
            <div
              className="rounded border border-dashed px-3 py-3 text-xs text-muted-foreground"
              onPaste={handlePaste}
              tabIndex={0}
            >
              Paste an image here (click first, then paste).
            </div>
          </div>
        </div>
        {uiMessage ? <p className="mt-3 text-xs text-muted-foreground">{uiMessage}</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Results</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Runs: {totalRuns}</span>
            <button
              type="button"
              className="rounded border px-3 py-1 text-xs"
              onClick={() => setWrapText((value) => !value)}
            >
              {wrapText ? "Disable Word Wrap" : "Enable Word Wrap"}
            </button>
          </div>
        </div>
        {runs.length ? (
          <div className="grid gap-4">
            {runs.map((run) => (
              <div key={run.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{run.label}</p>
                  <p className="text-xs text-muted-foreground">{run.status}</p>
                </div>
                {run.error ? <p className="mt-2 text-xs text-red-500">{run.error}</p> : null}
                {run.meta ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Model: {run.meta.model} · Pages: {run.meta.pages}
                  </p>
                ) : null}
                {run.cleanupStats ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cleanup: omitted {run.cleanupStats.omitted ?? 0} · uncertain kept{" "}
                    {run.cleanupStats.lowConfidenceKept ?? 0} · cache hits{" "}
                    {run.cleanupStats.cacheHits}
                  </p>
                ) : null}
                {run.cleanupWarning ? (
                  <p className="mt-1 text-xs text-amber-600">{run.cleanupWarning}</p>
                ) : null}
                {run.documentUuid ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <button
                      type="button"
                      className="rounded-full bg-foreground/90 px-3 py-1 text-[11px] font-semibold text-background"
                      onClick={() => {
                        window.location.href = `/${run.documentUuid}`;
                      }}
                    >
                      Open chat bubble
                    </button>
                    <span>Stored locally · Chunks: {run.chunkCount ?? 0}</span>
                  </div>
                ) : null}
                {run.text ? (
                  <pre
                    className={`mt-3 max-h-40 overflow-auto rounded bg-muted/30 p-2 text-xs ${
                      wrapText ? "whitespace-pre-wrap" : "whitespace-pre"
                    }`}
                  >
                    {run.text.slice(0, 280)}
                    {run.text.length > 280 ? "…" : ""}
                  </pre>
                ) : null}
                {run.images.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {run.images.map((image, index) => (
                      <div key={`${run.id}-${index}`} className="rounded border p-2">
                        <img
                          src={image}
                          alt={`Extracted ${index + 1}`}
                          className="h-auto w-full rounded"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No OCR runs yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">History</h2>
          <span className="text-xs text-muted-foreground">Saved locally</span>
        </div>
        {history.length ? (
          <div className="grid gap-3">
            {history.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs hover:border-foreground/40"
                onClick={() => {
                  window.location.href = `/${doc.uuid}`;
                }}
              >
                <span className="truncate font-semibold">{doc.title}</span>
                <span className="text-muted-foreground">
                  {new Date(doc.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No OCR history yet.</p>
        )}
      </section>
    </div>
  );
}
