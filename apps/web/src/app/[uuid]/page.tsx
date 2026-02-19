"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, ChevronLeft, Moon, MoreVertical, RotateCcw, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDocTitle } from "@/lib/format";
import {
  fetchDocumentByUuid,
  touchDocumentOpenedByUuid,
  toggleBubbleBookmark,
  softDeleteBubble,
  restoreBubble,
  type OcrDocumentDetails,
} from "@/lib/db";

const replaceMarkdownImages = (text: string, images: string[]) => {
  let index = 0;
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, () => {
    const image = images[index];
    index += 1;
    return image ? `![](${image})` : "";
  });
};

const splitSegments = (text: string): Array<{ type: "text" | "image"; value: string }> => {
  const segments: Array<{ type: "text" | "image"; value: string }> = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, match.index).trim() });
    }
    if (match[1]) {
      segments.push({ type: "image", value: match[1] });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor).trim() });
  }

  return segments.filter((segment) => segment.value.length > 0);
};

const getContactInitial = (name?: string | null) => {
  const fallback = "O";
  if (!name) {
    return fallback;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed[0]?.toUpperCase() ?? fallback;
};

type BubbleFilter = "all" | "bookmarked" | "deleted";

export default function WhatsappDocumentPage() {
  const params = useParams();
  const uuidParam = Array.isArray(params.uuid) ? params.uuid[0] : params.uuid;
  const [details, setDetails] = useState<OcrDocumentDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [bubbleFilter, setBubbleFilter] = useState<BubbleFilter>("all");
  const [pendingScrollBubbleId, setPendingScrollBubbleId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { resolvedTheme, setTheme, theme } = useTheme();
  const activeTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = activeTheme !== "light";
  const styles = {
    pageBg: isDark ? "bg-[#0b141a]" : "bg-[#efeae2]",
    pageText: isDark ? "text-[#e9edef]" : "text-[#111b21]",
    phoneBg: isDark ? "bg-[#0b141a]" : "bg-[#f7f8fa]",
    phoneBorder: isDark ? "border-[#1f2c34]" : "border-[#d1d7db]",
    headerBg: isDark ? "bg-[#202c33]" : "bg-[#f0f2f5]",
    icon: isDark ? "text-[#d1d7db]" : "text-[#54656f]",
    titleText: isDark ? "text-[#e9edef]" : "text-[#111b21]",
    mutedText: isDark ? "text-[#aebac1]" : "text-[#667781]",
    bodyBg: isDark ? "bg-[#0b141a]" : "bg-[#efeae2]",
    bubbleBg: isDark ? "bg-[#1f2c34]" : "bg-white",
    bubbleText: isDark ? "text-[#e9edef]" : "text-[#111b21]",
    bubbleBorder: isDark ? "border-[#0b141a]" : "border-[#d1d7db]",
    footerBg: isDark ? "bg-[#202c33]" : "bg-[#f0f2f5]",
    footerPanelBg: isDark ? "bg-[#1f2c34]" : "bg-white",
    footerPanelBorder: isDark ? "border-[#2a3942]" : "border-[#d1d7db]",
    menuBg: isDark ? "bg-[#1f2c34]" : "bg-white",
    menuBorder: isDark ? "border-[#1f2c34]" : "border-[#d1d7db]",
    menuText: isDark ? "text-[#e9edef]" : "text-[#111b21]",
    menuHover: isDark ? "hover:bg-[#2a3942]" : "hover:bg-[#f0f2f5]",
    dotPattern: isDark
      ? "[background-image:radial-gradient(circle_at_1px_1px,_rgba(255,255,255,0.05)_1px,_transparent_0)]"
      : "[background-image:radial-gradient(circle_at_1px_1px,_rgba(0,0,0,0.06)_1px,_transparent_0)]",
  };

  useEffect(() => {
    if (!uuidParam) {
      setError("Document not found.");
      setDetails(null);
      setIsLoading(false);
      return;
    }

    // Update recency so this thread bubbles to the top on the home screen.
    void touchDocumentOpenedByUuid(uuidParam);

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchDocumentByUuid(uuidParam)
      .then((result) => {
        if (!isMounted) {
          return;
        }
        if (!result) {
          setError("Document not found.");
          setDetails(null);
        } else {
          setDetails(result);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load document.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [uuidParam]);

  useEffect(() => {
    if (!selectedImage) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedImage]);

  const images = useMemo(
    () => details?.pages.flatMap((page) => page.images ?? []) ?? [],
    [details],
  );

  const processedBubbles = useMemo(() => {
    if (!details) {
      return [];
    }
    let imageIndex = 0;
    return details.bubbles.map((bubble) => {
      const remainingImages = images.slice(imageIndex);
      const replaced = replaceMarkdownImages(bubble.text, remainingImages);
      const segments = splitSegments(replaced);
      imageIndex += segments.filter((s) => s.type === "image").length;
      return { ...bubble, segments };
    });
  }, [details, images]);

  const filteredBubbles = useMemo(() => {
    switch (bubbleFilter) {
      case "bookmarked":
        return processedBubbles.filter((b) => b.bookmarkedAt !== null);
      case "deleted":
        return processedBubbles.filter((b) => b.deletedAt !== null);
      default:
        return processedBubbles.filter((b) => b.deletedAt === null);
    }
  }, [processedBubbles, bubbleFilter]);

  useEffect(() => {
    if (!pendingScrollBubbleId) {
      return;
    }

    const element = document.querySelector<HTMLElement>(
      `[data-bubble-id="${pendingScrollBubbleId}"]`,
    );
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setPendingScrollBubbleId(null);
  }, [pendingScrollBubbleId, bubbleFilter, filteredBubbles.length]);

  const refreshDetails = async () => {
    if (!uuidParam) return;
    const updated = await fetchDocumentByUuid(uuidParam);
    if (updated) setDetails(updated);
  };

  const handleBookmark = async (bubbleId: string) => {
    await toggleBubbleBookmark(bubbleId);
    await refreshDetails();
    setActiveBubbleId(null);
    setMenuPosition(null);
  };

  const handleDelete = async (bubbleId: string) => {
    await softDeleteBubble(bubbleId);
    await refreshDetails();
    setActiveBubbleId(null);
    setMenuPosition(null);
  };

  const handleRestore = async (bubbleId: string) => {
    await restoreBubble(bubbleId);
    await refreshDetails();
    setActiveBubbleId(null);
    setMenuPosition(null);
  };

  const handlePointerDown = (bubbleId: string, e: React.PointerEvent) => {
    // `article` spans the full row width. We want the menu to stick to the actual bubble.
    const anchor = (e.target as HTMLElement | null)?.closest?.(
      "[data-bubble-anchor]",
    ) as HTMLElement | null;
    const rect = (anchor ?? e.currentTarget).getBoundingClientRect();

    longPressTimer.current = setTimeout(() => {
      setActiveBubbleId(bubbleId);
      // Anchor to the bubble's right edge so the menu feels attached to the bubble.
      const x = Math.min(rect.right, window.innerWidth - 12);
      setMenuPosition({ x, y: rect.bottom });
    }, 300);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const dismissMenu = () => {
    setActiveBubbleId(null);
    setMenuPosition(null);
  };

  const handleGoToBubble = (bubbleId: string) => {
    const bubble = processedBubbles.find((b) => b.id === bubbleId);
    if (!bubble) {
      dismissMenu();
      return;
    }

    // Only invoked from the Bookmarked tab: jump back into the main chat timeline.
    setBubbleFilter("all");
    setPendingScrollBubbleId(bubbleId);
    dismissMenu();
  };

  const contentTitle = useMemo(() => {
    if (!details) return null;
    return details.document.contentTitle ?? null;
  }, [details]);

  const authorName = useMemo(() => {
    const url = details?.document.sourceUrl;
    if (url) {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "");
        if (host === "x.com" || host === "twitter.com") {
          const user = parsed.pathname.split("/").filter(Boolean)[0];
          if (user) return `@${user}`;
        }
        return host;
      } catch {
        return null;
      }
    }
    return null;
  }, [details?.document.sourceUrl]);

  const activeBubble = activeBubbleId
    ? processedBubbles.find((b) => b.id === activeBubbleId)
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b141a] px-4 py-10 text-[#e9edef]">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm text-[#8696a0]">Loading chat…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b141a] px-4 py-10 text-[#e9edef]">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm text-[#ff9b9b]">{error}</p>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen bg-[#0b141a] px-4 py-10 text-[#e9edef]">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm text-[#8696a0]">No document loaded.</p>
        </div>
      </div>
    );
  }

  const contactName =
    contentTitle ?? formatDocTitle(details.document.sourceName, details.document.sourceUrl);
  const contactInitial = getContactInitial(contactName);

  const messageCount = details.bubbles.filter((b) => b.deletedAt === null).length;
  const subtitle = [
    authorName,
    `${details.document.pageCount} ${details.document.pageCount === 1 ? "page" : "pages"}`,
    `${messageCount} ${messageCount === 1 ? "message" : "messages"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const filterTabs: { key: BubbleFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "bookmarked", label: "Bookmarked" },
    { key: "deleted", label: "Deleted" },
  ];

  return (
    <div
      className={`flex min-h-[100svh] flex-col items-center ${styles.pageBg} ${styles.pageText}`}
    >
      <div
        className={`flex h-[100svh] w-full max-w-md flex-col overflow-hidden rounded-none border shadow-2xl ${styles.phoneBg} ${styles.phoneBorder}`}
      >
        <section className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${styles.bodyBg}`}>
          <header
            className={`sticky top-0 z-20 -mx-px w-[calc(100%+2px)] rounded-none ${styles.headerBg}`}
          >
            <div className="flex items-center gap-3 px-4 pb-3 pt-2">
              <Link
                className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/5 ${styles.icon}`}
                href="/"
                aria-label="Back to OCR runs"
              >
                <ChevronLeft size={20} />
              </Link>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#005c4b] text-sm font-semibold text-white">
                {contactInitial}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <h1 className={`truncate text-base font-semibold ${styles.titleText}`}>
                    {contactName}
                  </h1>
                  <p className={`text-xs ${styles.mutedText}`}>{subtitle}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition ${styles.icon} ${styles.menuHover}`}
                    aria-label="Chat options"
                  >
                    <MoreVertical size={18} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className={`rounded-xl border px-3 py-2 ${styles.menuBorder} ${styles.menuBg} ${styles.menuText}`}
                  >
                    <div className="relative flex items-center gap-2">
                      <div
                        className={`pointer-events-none absolute left-0 top-0 h-8 w-8 rounded-full border-2 border-[#25d366] transition-transform duration-200 ${
                          activeTheme === "dark" ? "translate-x-10" : "translate-x-0"
                        }`}
                      />
                      <button
                        className={`flex h-8 w-8 items-center justify-center rounded-full border border-transparent transition ${styles.icon} ${styles.menuHover}`}
                        type="button"
                        onClick={() => setTheme("light")}
                        aria-label="Set light theme"
                      >
                        <Sun size={16} />
                      </button>
                      <button
                        className={`flex h-8 w-8 items-center justify-center rounded-full border border-transparent transition ${styles.icon} ${styles.menuHover}`}
                        type="button"
                        onClick={() => setTheme("dark")}
                        aria-label="Set dark theme"
                      >
                        <Moon size={16} />
                      </button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className={`flex gap-1 border-t px-4 py-1.5 ${styles.phoneBorder}`}>
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setBubbleFilter(tab.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    bubbleFilter === tab.key
                      ? "bg-[#005c4b] text-white"
                      : `${styles.mutedText} ${styles.menuHover}`
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </header>

          <div className="relative flex flex-1 flex-col gap-4 px-3 py-4">
            <div
              className={`pointer-events-none absolute inset-0 opacity-40 [background-size:24px_24px] ${
                styles.dotPattern
              }`}
            />
            <div className="relative flex flex-col gap-3">
              {filteredBubbles.map((bubble) => {
                const isActive = activeBubbleId === bubble.id;
                const isDimmed = activeBubbleId !== null && !isActive;
                const isDeletedView = bubbleFilter === "deleted";

                return (
                  <article
                    key={bubble.id}
                    data-bubble-id={bubble.id}
                    className={`flex w-full flex-col items-start gap-3 transition-all ${"duration-200 ease-in-out"} ${isActive ? "relative z-10 origin-top-left translate-x-2 scale-105" : ""} ${
                      isDimmed ? "blur-sm opacity-50" : ""
                    } ${isDeletedView ? "opacity-60" : ""}`}
                    onPointerDown={(e) => handlePointerDown(bubble.id, e)}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <div className="flex w-full flex-col items-start gap-3">
                      {bubble.segments.map((segment, index) => {
                        if (segment.type === "image") {
                          return (
                            <Message
                              key={`${bubble.id}-img-${index}`}
                              from="assistant"
                              className="max-w-[85%] self-start"
                            >
                              <MessageContent
                                data-bubble-anchor
                                className={`rounded-2xl p-2 shadow ${styles.bubbleBg} ${styles.bubbleText}`}
                              >
                                <img
                                  src={segment.value}
                                  alt="OCR excerpt"
                                  className={`h-auto w-full cursor-zoom-in rounded-xl border ${styles.bubbleBorder}`}
                                  onClick={() => {
                                    setSelectedImage(segment.value);
                                    setIsZoomed(false);
                                  }}
                                />
                              </MessageContent>
                            </Message>
                          );
                        }

                        return (
                          <Message
                            key={`${bubble.id}-text-${index}`}
                            from="assistant"
                            className="relative max-w-[85%] self-start"
                          >
                            <MessageContent
                              data-bubble-anchor
                              className={`rounded-2xl px-4 py-3 shadow ${styles.bubbleBg} ${styles.bubbleText}`}
                            >
                              <MessageResponse>{segment.value}</MessageResponse>
                            </MessageContent>
                            {bubble.bookmarkedAt && (
                              <Bookmark
                                size={12}
                                className="absolute -top-1 right-1 fill-[#25d366] text-[#25d366]"
                              />
                            )}
                          </Message>
                        );
                      })}
                    </div>
                  </article>
                );
              })}

              <div className="pb-2 pt-4">
                <div
                  className={`rounded-2xl border px-4 py-3 text-center text-sm ${
                    styles.footerPanelBg
                  } ${styles.footerPanelBorder} ${styles.mutedText}`}
                >
                  Congratulations, you&apos;ve finished your reading. Go back to the main menu.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {activeBubbleId !== null && menuPosition !== null && (
        <div className="fixed inset-0 z-40" onClick={dismissMenu}>
          <div
            className={`absolute z-50 flex gap-2 rounded-xl border px-3 py-2 shadow-lg ${styles.menuBg} ${styles.menuBorder}`}
            style={{
              left: `${menuPosition.x}px`,
              top: `${menuPosition.y + 12}px`,
              transform: "translateX(-100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {bubbleFilter === "deleted" ? (
              <button
                type="button"
                onClick={() => handleRestore(activeBubbleId)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${styles.menuText} ${styles.menuHover}`}
              >
                <RotateCcw size={14} />
                Restore
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleBookmark(activeBubbleId)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${styles.menuText} ${styles.menuHover}`}
                >
                  <Bookmark
                    size={14}
                    className={activeBubble?.bookmarkedAt ? "fill-[#25d366] text-[#25d366]" : ""}
                  />
                  {activeBubble?.bookmarkedAt ? "Unbookmark" : "Bookmark"}
                </button>
                {bubbleFilter === "bookmarked" && (
                  <button
                    type="button"
                    onClick={() => handleGoToBubble(activeBubbleId)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${styles.menuText} ${styles.menuHover}`}
                  >
                    Go to chat bubble
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(activeBubbleId)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition ${styles.menuHover}`}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {selectedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-2 text-sm text-white"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedImage(null);
            }}
          >
            Close
          </button>
          <div
            className="max-h-full max-w-full overflow-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedImage}
              alt="OCR preview"
              className={`max-h-[80vh] max-w-[90vw] rounded-2xl border border-white/10 shadow-2xl transition-transform duration-200 ${
                isZoomed ? "cursor-zoom-out scale-150" : "cursor-zoom-in scale-100"
              }`}
              onClick={() => setIsZoomed((prev) => !prev)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
