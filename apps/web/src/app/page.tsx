"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Globe,
  Image,
  Info,
  Loader2,
  Moon,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteDocumentByUuid,
  listDocuments,
  saveOcrSession,
  toggleDocumentPinnedByUuid,
  touchDocumentOpenedByUuid,
  updateDocumentTitle,
} from "@/lib/db";
import { chunkMarkdown } from "@/lib/engine";
import type { MarkdownChunk } from "@/lib/engine/chunk";
import { formatDocTitle, getDisplayTitle } from "@/lib/format";

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
  elapsedMs?: number;
  error?: string;
};

const useElapsedTimer = (isRunning: boolean) => {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      if (startRef.current) {
        setElapsed(Date.now() - startRef.current);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  return elapsed;
};

const formatElapsed = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }
  return `${seconds}.${tenths}s`;
};

type OcrImagePayload = { imageBase64?: string | null };
type OcrPagePayload = {
  index?: number;
  markdown?: string;
  images?: OcrImagePayload[];
};

type HistoryItem = {
  id: string;
  uuid: string;
  title: string;
  createdAt: string;
  pinnedAt?: string | null;
  lastOpenedAt?: string | null;
  sourceType?: string;
  pageCount?: number;
  chunkCount?: number;
  isGeneratingTitle?: boolean;
};

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const getDocInitial = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "D";
  }
  return trimmed[0]?.toUpperCase() ?? "D";
};

const getDocColor = (uuid: string) => {
  const colors = [
    "bg-[#005c4b]",
    "bg-[#025144]",
    "bg-[#7f5539]",
    "bg-[#6d4c41]",
    "bg-[#00695c]",
    "bg-[#2e7d32]",
    "bg-[#0277bd]",
    "bg-[#4527a0]",
  ];
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = uuid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getSourceIcon = (sourceType?: string) => {
  switch (sourceType) {
    case "url":
      return Globe;
    case "paste":
      return Image;
    default:
      return FileText;
  }
};

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [documentUrls, setDocumentUrls] = useState<string>("");
  const [uiMessage, setUiMessage] = useState<string>("");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [runs, setRuns] = useState<OcrRun[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [swipedId, setSwipedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const elapsed = useElapsedTimer(pendingCount > 0);

  const s = {
    pageBg: "bg-[#efeae2] dark:bg-[#0b141a]",
    pageText: "text-[#111b21] dark:text-[#e9edef]",
    phoneBg: "bg-[#f7f8fa] dark:bg-[#0b141a]",
    phoneBorder: "border-[#d1d7db] dark:border-[#1f2c34]",
    headerBg: "bg-[#f0f2f5] dark:bg-[#202c33]",
    icon: "text-[#54656f] dark:text-[#d1d7db]",
    titleText: "text-[#111b21] dark:text-[#e9edef]",
    mutedText: "text-[#667781] dark:text-[#aebac1]",
    bodyBg: "bg-[#ffffff] dark:bg-[#0b141a]",
    chatItemHover: "hover:bg-[#f0f2f5] dark:hover:bg-[#202c33]",
    chatItemBorder: "border-[#e9edef] dark:border-[#222d34]",
    searchBg: "bg-[#f0f2f5] dark:bg-[#202c33]",
    searchText: "text-[#111b21] dark:text-[#e9edef]",
    searchPlaceholder: "placeholder:text-[#667781] dark:placeholder:text-[#8696a0]",
    sheetBg: "bg-[#ffffff] dark:bg-[#111b21]",
    sheetBorder: "border-[#d1d7db] dark:border-[#2a3942]",
    inputBg: "bg-[#f0f2f5] dark:bg-[#202c33]",
    inputText: "text-[#111b21] dark:text-[#e9edef]",
    inputBorder: "border-[#d1d7db] dark:border-[#2a3942]",
    menuBg: "bg-white dark:bg-[#1f2c34]",
    menuBorder: "border-[#d1d7db] dark:border-[#1f2c34]",
    menuText: "text-[#111b21] dark:text-[#e9edef]",
    menuHover: "hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942]",
    dotPattern:
      "[background-image:radial-gradient(circle_at_1px_1px,_rgba(0,0,0,0.04)_1px,_transparent_0)] dark:[background-image:radial-gradient(circle_at_1px_1px,_rgba(255,255,255,0.03)_1px,_transparent_0)]",
  };

  const handleDelete = useCallback(async (uuid: string) => {
    const deleted = await deleteDocumentByUuid(uuid);
    if (deleted) {
      setHistory((prev) => prev.filter((doc) => doc.uuid !== uuid));
      setSwipedId(null);
    }
  }, []);

  const sortHistory = useCallback((items: HistoryItem[]) => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      const aPinned = a.pinnedAt ? 1 : 0;
      const bPinned = b.pinnedAt ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }
      const aOpened = a.lastOpenedAt ?? a.createdAt;
      const bOpened = b.lastOpenedAt ?? b.createdAt;
      return bOpened.localeCompare(aOpened);
    });
    return sorted;
  }, []);

  const handleTogglePinned = useCallback(
    async (uuid: string) => {
      const updated = await toggleDocumentPinnedByUuid(uuid);
      if (!updated) {
        return;
      }
      setHistory((prev) =>
        sortHistory(
          prev.map((doc) =>
            doc.uuid === uuid ? { ...doc, pinnedAt: updated.pinnedAt ?? null } : doc,
          ),
        ),
      );
    },
    [sortHistory],
  );

  const handleOpenDocument = useCallback(
    async (uuid: string) => {
      // Optimistically bump in the list, then persist.
      const now = new Date().toISOString();
      setHistory((prev) =>
        sortHistory(prev.map((doc) => (doc.uuid === uuid ? { ...doc, lastOpenedAt: now } : doc))),
      );
      void touchDocumentOpenedByUuid(uuid);
      window.location.href = `/${uuid}`;
    },
    [sortHistory],
  );

  const trimmedUrls = useMemo(
    () =>
      documentUrls
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [documentUrls],
  );

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) {
      return history;
    }
    const query = searchQuery.toLowerCase();
    return history.filter((doc) => doc.title.toLowerCase().includes(query));
  }, [history, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    listDocuments()
      .then((docs) => {
        if (!isMounted) {
          return;
        }
        setHistory(
          sortHistory(
            docs.map((doc) => ({
              id: doc.id,
              uuid: doc.uuid,
              title: getDisplayTitle(doc.contentTitle, doc.sourceName, doc.sourceUrl),
              createdAt: doc.createdAt,
              pinnedAt: doc.pinnedAt ?? null,
              lastOpenedAt: doc.lastOpenedAt ?? null,
              sourceType: doc.sourceType,
              pageCount: doc.pageCount,
              chunkCount: doc.chunkCount,
            })),
          ),
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
        status: "Processing...",
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
    const startTime = Date.now();
    setUiMessage("");
    setPendingCount((count) => count + 1);

    try {
      const useExtract = sourceType === "url" && url && !file;
      let response: Response;
      if (useExtract) {
        response = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      } else {
        const formData = new FormData();
        if (file) {
          formData.append("file", file);
        }
        if (url) {
          formData.append("url", url);
        }
        response = await fetch("/api/ocr", {
          method: "POST",
          body: formData,
        });
      }
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
        model: data.model ?? (useExtract ? "parallel-extract" : "mistral-ocr-latest"),
        pages: pages.map((page: OcrPagePayload, index: number) => ({
          index: page.index ?? index,
          markdown: page.markdown ?? "",
          images: (page.images ?? [])
            .map((image) => image.imageBase64)
            .filter((image): image is string => Boolean(image)),
        })),
        chunks,
        contentTitle: data.title,
        textLength: cleanedText.length,
      });
      finalizeRun(runId, {
        text: cleanedText,
        images,
        meta: {
          model: data.model ?? (useExtract ? "parallel-extract" : "mistral-ocr-latest"),
          pages: pages.length,
        },
        chunkCount: chunks.length,
        documentId: savedDocument.id,
        documentUuid: savedDocument.uuid,
        elapsedMs: Date.now() - startTime,
        error: undefined,
      });
      setHistory((prev) =>
        sortHistory([
          {
            id: savedDocument.id,
            uuid: savedDocument.uuid,
            title:
              data.title ||
              formatDocTitle(file?.name, sourceType === "url" ? url?.trim() : undefined),
            createdAt: new Date().toISOString(),
            pinnedAt: null,
            lastOpenedAt: new Date().toISOString(),
            sourceType,
            pageCount: pages.length,
            chunkCount: chunks.length,
            isGeneratingTitle: !data.title,
          },
          ...prev,
        ]),
      );
      // Generate title async via LLM
      if (!data.title) {
        const titleText = cleanedText.slice(0, 300);
        if (titleText) {
          fetch("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: titleText }),
          })
            .then((res) => res.json())
            .then(async (titleData) => {
              const generatedTitle = titleData.title;
              if (generatedTitle) {
                await updateDocumentTitle(savedDocument.id, generatedTitle);
                setHistory((prev) =>
                  prev.map((item) =>
                    item.id === savedDocument.id
                      ? { ...item, title: generatedTitle, isGeneratingTitle: false }
                      : item,
                  ),
                );
              } else {
                setHistory((prev) =>
                  prev.map((item) =>
                    item.id === savedDocument.id ? { ...item, isGeneratingTitle: false } : item,
                  ),
                );
              }
            })
            .catch(() => {
              setHistory((prev) =>
                prev.map((item) =>
                  item.id === savedDocument.id ? { ...item, isGeneratingTitle: false } : item,
                ),
              );
            });
        }
      }
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
    setShowAddSheet(false);
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
    setShowAddSheet(false);
    for (const file of selectedFiles) {
      if (!isSupportedFile(file)) {
        const runId = addRun(`File: ${file.name}`);
        failRun(runId, "Unsupported file type. Use images or PDFs.");
        continue;
      }
      await runOcrRequest({ file, sourceType: "file", label: `File: ${file.name}` });
    }
    setSelectedFiles([]);
  };

  const handleProcessUrls = async () => {
    if (!trimmedUrls.length) {
      setUiMessage("Add one or more https URLs to run OCR.");
      return;
    }
    setUiMessage("");
    setShowAddSheet(false);
    for (const url of trimmedUrls) {
      if (!url.startsWith("https://")) {
        const runId = addRun(`URL: ${url}`);
        failRun(runId, "URL must start with https://");
        continue;
      }
      await runOcrRequest({ url, sourceType: "url", label: `URL: ${url}` });
    }
    setDocumentUrls("");
  };

  const isProcessing = pendingCount > 0;

  const processingRuns = runs.filter((run) => !run.meta && !run.error);

  const pinnedHistory = filteredHistory.filter((doc) => Boolean(doc.pinnedAt));
  const normalHistory = filteredHistory.filter((doc) => !doc.pinnedAt);

  return (
    <div className={`flex min-h-[100svh] flex-col items-center ${s.pageBg} ${s.pageText}`}>
      <div
        className={`relative flex h-[100svh] w-full max-w-md flex-col overflow-hidden rounded-none border shadow-2xl ${s.phoneBg} ${s.phoneBorder}`}
      >
        {/* Header */}
        <header className={`shrink-0 ${s.headerBg}`}>
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h1 className={`text-xl font-bold tracking-tight ${s.titleText}`}>chat-read</h1>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition ${s.icon} ${s.menuHover}`}
                  aria-label="Options"
                >
                  <MoreVertical size={18} />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className={`rounded-xl border px-1 py-1 ${s.menuBorder} ${s.menuBg} ${s.menuText}`}
                >
                  <DropdownMenuItem
                    className={`gap-2 rounded-lg px-3 py-2 text-xs ${s.menuHover}`}
                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  >
                    {resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                    {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  <div className={`my-1 border-t ${s.menuBorder}`} />
                  <DropdownMenuItem
                    className={`gap-2 rounded-lg px-3 py-2 text-xs ${s.menuHover}`}
                    onClick={() => router.push("/about")}
                  >
                    <Info size={14} />
                    About
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-3 pb-3 pt-1">
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${s.searchBg}`}>
              <Search size={15} className={s.mutedText} />
              <input
                type="text"
                placeholder="Search"
                className={`w-full bg-transparent text-sm outline-none ${s.searchText} ${s.searchPlaceholder}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery("")} className={s.mutedText}>
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Chat list */}
        <section className={`relative flex-1 overflow-y-auto ${s.bodyBg}`}>
          <div
            className={`pointer-events-none absolute inset-0 opacity-30 [background-size:24px_24px] ${s.dotPattern}`}
          />
          <div className="relative">
            {/* Processing runs — shown as temporary items at top */}
            {processingRuns.map((run) => (
              <div
                key={run.id}
                className={`flex items-center gap-3 border-b px-4 py-3 ${s.chatItemBorder}`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#005c4b]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm font-medium ${s.titleText}`}>{run.label}</p>
                    <span className={`shrink-0 font-mono text-[11px] tabular-nums ${s.mutedText}`}>
                      ⏱ {formatElapsed(elapsed)}
                    </span>
                  </div>
                  <p className={`text-xs ${s.mutedText}`}>{run.status}</p>
                </div>
              </div>
            ))}

            {/* Error runs */}
            {runs
              .filter((run) => run.error)
              .map((run) => (
                <div
                  key={run.id}
                  className={`flex items-center gap-3 border-b px-4 py-3 ${s.chatItemBorder}`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ea3434]/20">
                    <X size={18} className="text-[#ea3434]" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className={`truncate text-sm font-medium ${s.titleText}`}>{run.label}</p>
                    <p className="truncate text-xs text-[#ea3434]">{run.error}</p>
                  </div>
                </div>
              ))}

            {/* Document list */}
            {pinnedHistory.length ? (
              <div className="px-4 pb-2 pt-3">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${s.mutedText}`}>
                  Pinned
                </p>
              </div>
            ) : null}

            {pinnedHistory.map((doc) => {
              const SourceIcon = getSourceIcon(doc.sourceType);
              const isSwiped = swipedId === doc.uuid;
              return (
                <div
                  key={doc.id}
                  className={`relative overflow-hidden border-b ${s.chatItemBorder}`}
                >
                  {/* Delete action behind */}
                  <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-[#ea3434]">
                    <Trash2 size={18} className="text-white" />
                  </div>

                  {/* Chat item */}
                  <div
                    className={`relative flex items-center gap-3 px-4 py-3 transition-transform duration-200 ${
                      isSwiped ? "-translate-x-20" : "translate-x-0"
                    } ${s.bodyBg} ${s.chatItemHover}`}
                    onClick={() => {
                      if (isSwiped) {
                        setSwipedId(null);
                        return;
                      }
                      void handleOpenDocument(doc.uuid);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSwipedId(isSwiped ? null : doc.uuid);
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${getDocColor(doc.uuid)}`}
                    >
                      {getDocInitial(doc.title)}
                    </div>

                    {/* Content */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-[15px] font-medium ${s.titleText}`}>
                          {doc.isGeneratingTitle ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Loader2 size={12} className="animate-spin" />
                              <span className={s.mutedText}>Generating title…</span>
                            </span>
                          ) : (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              {doc.pinnedAt ? (
                                <Pin size={12} className="shrink-0 text-[#005c4b]" />
                              ) : null}
                              <span className="truncate">{doc.title}</span>
                            </span>
                          )}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={`text-[11px] ${s.mutedText}`}>
                            {formatRelativeTime(doc.createdAt)}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${s.icon} ${s.menuHover}`}
                              aria-label="Thread actions"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <MoreVertical size={16} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className={`rounded-xl border px-1 py-1 ${s.menuBorder} ${s.menuBg} ${s.menuText}`}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <DropdownMenuItem
                                className={`gap-2 rounded-lg px-3 py-2 text-xs ${s.menuHover}`}
                                onClick={() => {
                                  void handleTogglePinned(doc.uuid);
                                }}
                              >
                                <Pin size={14} />
                                {doc.pinnedAt ? "Unpin" : "Pin"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className={`gap-2 rounded-lg px-3 py-2 text-xs ${s.menuHover}`}
                                onClick={() => {
                                  const confirmed = window.confirm(
                                    "Delete this thread? This will remove it from your local history.",
                                  );
                                  if (!confirmed) {
                                    return;
                                  }
                                  void handleDelete(doc.uuid);
                                }}
                              >
                                <Trash2 size={14} />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs ${s.mutedText}`}>
                        <SourceIcon size={12} />
                        <span className="truncate">
                          {doc.pageCount ? `${doc.pageCount} pages` : ""}
                          {doc.pageCount && doc.chunkCount ? " · " : ""}
                          {doc.chunkCount ? `${doc.chunkCount} messages` : ""}
                          {!doc.pageCount && !doc.chunkCount ? "OCR document" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delete button when swiped */}
                  {isSwiped ? (
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-[#ea3434] text-white transition-opacity"
                      onClick={() => handleDelete(doc.uuid)}
                    >
                      <Trash2 size={18} />
                    </button>
                  ) : null}
                </div>
              );
            })}

            {pinnedHistory.length && normalHistory.length ? (
              <div className={`mx-4 border-t ${s.chatItemBorder}`} />
            ) : null}

            {normalHistory.length ? (
              <div className="px-4 pb-2 pt-3">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${s.mutedText}`}>
                  Threads
                </p>
              </div>
            ) : null}

            {normalHistory.map((doc) => {
              const SourceIcon = getSourceIcon(doc.sourceType);
              const isSwiped = swipedId === doc.uuid;
              return (
                <div
                  key={doc.id}
                  className={`relative overflow-hidden border-b ${s.chatItemBorder}`}
                >
                  {/* Delete action behind */}
                  <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-[#ea3434]">
                    <Trash2 size={18} className="text-white" />
                  </div>

                  {/* Chat item */}
                  <div
                    className={`relative flex items-center gap-3 px-4 py-3 transition-transform duration-200 ${
                      isSwiped ? "-translate-x-20" : "translate-x-0"
                    } ${s.bodyBg} ${s.chatItemHover}`}
                    onClick={() => {
                      if (isSwiped) {
                        setSwipedId(null);
                        return;
                      }
                      void handleOpenDocument(doc.uuid);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSwipedId(isSwiped ? null : doc.uuid);
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${getDocColor(doc.uuid)}`}
                    >
                      {getDocInitial(doc.title)}
                    </div>

                    {/* Content */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-[15px] font-medium ${s.titleText}`}>
                          {doc.isGeneratingTitle ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Loader2 size={12} className="animate-spin" />
                              <span className={s.mutedText}>Generating title…</span>
                            </span>
                          ) : (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{doc.title}</span>
                            </span>
                          )}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={`text-[11px] ${s.mutedText}`}>
                            {formatRelativeTime(doc.createdAt)}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${s.icon} ${s.menuHover}`}
                              aria-label="Thread actions"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <MoreVertical size={16} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className={`rounded-xl border px-1 py-1 ${s.menuBorder} ${s.menuBg} ${s.menuText}`}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <DropdownMenuItem
                                className={`gap-2 rounded-lg px-3 py-2 text-xs ${s.menuHover}`}
                                onClick={() => {
                                  void handleTogglePinned(doc.uuid);
                                }}
                              >
                                <Pin size={14} />
                                {doc.pinnedAt ? "Unpin" : "Pin"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className={`gap-2 rounded-lg px-3 py-2 text-xs ${s.menuHover}`}
                                onClick={() => {
                                  const confirmed = window.confirm(
                                    "Delete this thread? This will remove it from your local history.",
                                  );
                                  if (!confirmed) {
                                    return;
                                  }
                                  void handleDelete(doc.uuid);
                                }}
                              >
                                <Trash2 size={14} />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs ${s.mutedText}`}>
                        <SourceIcon size={12} />
                        <span className="truncate">
                          {doc.pageCount ? `${doc.pageCount} pages` : ""}
                          {doc.pageCount && doc.chunkCount ? " · " : ""}
                          {doc.chunkCount ? `${doc.chunkCount} messages` : ""}
                          {!doc.pageCount && !doc.chunkCount ? "OCR document" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delete button when swiped */}
                  {isSwiped ? (
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-[#ea3434] text-white transition-opacity"
                      onClick={() => handleDelete(doc.uuid)}
                    >
                      <Trash2 size={18} />
                    </button>
                  ) : null}
                </div>
              );
            })}

            {/* Empty state */}
            {!filteredHistory.length && !processingRuns.length && !runs.some((r) => r.error) ? (
              <div className="flex flex-col items-center gap-4 px-6 py-16">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full ${s.searchBg}`}
                >
                  <FileText size={28} className={s.mutedText} />
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium ${s.titleText}`}>No documents yet</p>
                  <p className={`mt-1 text-xs ${s.mutedText}`}>
                    Tap the + button to add a document or link
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* FAB */}
        <button
          type="button"
          className="absolute bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#005c4b] shadow-lg transition-transform active:scale-95"
          onClick={() => setShowAddSheet(true)}
          disabled={isProcessing}
          aria-label="Add document"
        >
          <Plus size={24} className="text-white" />
        </button>

        {/* Bottom sheet */}
        {showAddSheet ? (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/50"
              onClick={() => setShowAddSheet(false)}
            />
            <div
              className={`absolute inset-x-0 bottom-0 z-50 flex max-h-[80%] flex-col rounded-t-2xl border-t ${s.sheetBg} ${s.sheetBorder}`}
            >
              {/* Sheet header */}
              <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <h2 className={`text-base font-semibold ${s.titleText}`}>Add document</h2>
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${s.mutedText} ${s.chatItemHover}`}
                  onClick={() => setShowAddSheet(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-6">
                {/* File upload */}
                <div className="space-y-2 py-3">
                  <p className={`text-xs font-semibold ${s.mutedText}`}>Upload files</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(event) =>
                      setSelectedFiles(Array.from(event.target.files ?? []).filter(Boolean))
                    }
                  />
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${s.inputBorder} ${s.chatItemHover}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText size={18} className={s.mutedText} />
                    <span className={s.titleText}>
                      {selectedFiles.length
                        ? selectedFiles.map((f) => f.name).join(", ")
                        : "Choose images or PDFs"}
                    </span>
                  </button>
                  {selectedFiles.length ? (
                    <button
                      type="button"
                      className="w-full rounded-xl bg-[#005c4b] px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.98]"
                      onClick={handleProcessFiles}
                      disabled={isProcessing}
                    >
                      {isProcessing
                        ? "Processing…"
                        : `Run OCR on ${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""}`}
                    </button>
                  ) : null}
                </div>

                {/* Divider */}
                <div className={`my-1 border-t ${s.chatItemBorder}`} />

                {/* URL input */}
                <div className="space-y-2 py-3">
                  <p className={`text-xs font-semibold ${s.mutedText}`}>From URL</p>
                  <textarea
                    placeholder={"https://example.com/document.pdf\nhttps://example.com/article"}
                    className={`min-h-[72px] w-full rounded-xl border px-4 py-3 text-sm outline-none ${s.inputBg} ${s.inputText} ${s.inputBorder} ${s.searchPlaceholder}`}
                    value={documentUrls}
                    onChange={(event) => setDocumentUrls(event.target.value)}
                  />
                  {trimmedUrls.length ? (
                    <button
                      type="button"
                      className="w-full rounded-xl bg-[#005c4b] px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.98]"
                      onClick={handleProcessUrls}
                      disabled={isProcessing}
                    >
                      {isProcessing
                        ? "Processing…"
                        : `Run OCR on ${trimmedUrls.length} URL${trimmedUrls.length > 1 ? "s" : ""}`}
                    </button>
                  ) : null}
                </div>

                {/* Divider */}
                <div className={`my-1 border-t ${s.chatItemBorder}`} />

                {/* Paste area */}
                <div className="space-y-2 py-3">
                  <p className={`text-xs font-semibold ${s.mutedText}`}>Paste image</p>
                  <div
                    className={`flex items-center justify-center rounded-xl border border-dashed px-4 py-6 text-xs ${s.inputBorder} ${s.mutedText}`}
                    onPaste={handlePaste}
                    tabIndex={0}
                  >
                    Click here, then paste an image
                  </div>
                </div>

                {uiMessage ? <p className={`mt-1 text-xs ${s.mutedText}`}>{uiMessage}</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
