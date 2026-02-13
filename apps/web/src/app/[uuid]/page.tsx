"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Moon, MoreVertical, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchDocumentByUuid, type OcrDocumentDetails } from "@/lib/db";
import { splitIntoSentences } from "@/lib/engine";

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

const CONTINUATION_WORDS = new Set(["and", "but", "or", "because", "when"]);
const TARGET_MIN_CHARS = 180;
const TARGET_MAX_CHARS = 320;
const HARD_MAX_CHARS = 420;
const ORPHAN_MIN_CHARS = 90;
const isLikelyHeadingLine = (line: string) => /^#{1,6}\s+/.test(line.trim());
const isSalutationLine = (line: string) =>
  /^(dear|hi|hello)\b/i.test(line.trim()) || /,$/.test(line.trim());
const isStandaloneTitleLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) {
    return false;
  }
  if (isLikelyHeadingLine(trimmed) || isSalutationLine(trimmed)) {
    return true;
  }
  return /^[A-Z][A-Za-z0-9&'()\- ]+$/.test(trimmed) && !/[.!?]$/.test(trimmed);
};

const splitWordsByLimit = (line: string, limit: number) => {
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

const shouldPreferAttach = (sentence: string) => {
  const firstWord = sentence.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return CONTINUATION_WORDS.has(firstWord) || /^[a-z]/.test(sentence.trim());
};

const buildTextBlocks = (text: string): string[] => {
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

const splitTextForBubbles = (text: string, hardMax = HARD_MAX_CHARS) => {
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

export default function WhatsappDocumentPage() {
  const params = useParams();
  const uuidParam = Array.isArray(params.uuid) ? params.uuid[0] : params.uuid;
  const [details, setDetails] = useState<OcrDocumentDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
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

  const chunks = useMemo(() => {
    if (!details) {
      return [];
    }
    let imageIndex = 0;
    return details.chunks.map((chunk) => {
      const remainingImages = images.slice(imageIndex);
      const replaced = replaceMarkdownImages(chunk.text, remainingImages);
      const segments = splitSegments(replaced);
      imageIndex += segments.filter((segment) => segment.type === "image").length;
      return { id: chunk.id, order: chunk.order, segments };
    });
  }, [details, images]);

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

  const contactName = details.document.sourceName ?? "OCR chat";
  const contactInitial = getContactInitial(contactName);
  const subtitle = details.document.pageCount
    ? `${details.document.model} · ${details.document.pageCount} pages`
    : "OCR document";

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
          </header>

          <div className="relative flex flex-1 flex-col gap-4 px-3 py-4">
            <div
              className={`pointer-events-none absolute inset-0 opacity-40 [background-size:24px_24px] ${
                styles.dotPattern
              }`}
            />
            <div className="relative flex flex-col gap-3">
              {chunks.map((chunk) => (
                <article key={chunk.id} className="flex w-full flex-col items-start gap-3">
                  <div className="flex w-full flex-col items-start gap-3">
                    {chunk.segments.flatMap((segment, index) => {
                      if (segment.type === "image") {
                        return [
                          <Message
                            key={`${chunk.id}-img-${index}`}
                            from="assistant"
                            className="max-w-[85%] self-start"
                          >
                            <MessageContent
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
                          </Message>,
                        ];
                      }

                      const bubbles = splitTextForBubbles(segment.value);
                      return bubbles.map((bubble, bubbleIndex) => (
                        <Message
                          key={`${chunk.id}-text-${index}-${bubbleIndex}`}
                          from="assistant"
                          className="max-w-[85%] self-start"
                        >
                          <MessageContent
                            className={`rounded-2xl px-4 py-3 shadow ${styles.bubbleBg} ${styles.bubbleText}`}
                          >
                            <MessageResponse>{bubble}</MessageResponse>
                          </MessageContent>
                        </Message>
                      ));
                    })}
                  </div>
                </article>
              ))}

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
