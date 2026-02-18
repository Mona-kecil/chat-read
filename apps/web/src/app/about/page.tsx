"use client";

import { ChevronLeft, Database, FileText, MessageSquare, ScanText, Shield } from "lucide-react";
import Link from "next/link";

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
  cardBorder: "border-[#e9edef] dark:border-[#222d34]",
  dotPattern:
    "[background-image:radial-gradient(circle_at_1px_1px,_rgba(0,0,0,0.04)_1px,_transparent_0)] dark:[background-image:radial-gradient(circle_at_1px_1px,_rgba(255,255,255,0.03)_1px,_transparent_0)]",
};

const steps = [
  {
    icon: FileText,
    title: "Upload or paste",
    description: "Drop a PDF, image, or paste a URL. We accept anything with text.",
  },
  {
    icon: ScanText,
    title: "AI extracts the text",
    description:
      "Mistral OCR reads your document — even handwritten notes and complex layouts — and turns it into clean markdown.",
  },
  {
    icon: MessageSquare,
    title: "Read as chat bubbles",
    description:
      "The text is split into bite-sized chunks and presented as WhatsApp-style messages you can scroll through, bookmark, or hide.",
  },
];

export default function AboutPage() {
  return (
    <div className={`flex min-h-[100svh] flex-col items-center ${s.pageBg} ${s.pageText}`}>
      <div
        className={`relative flex h-[100svh] w-full max-w-md flex-col overflow-hidden rounded-none border shadow-2xl ${s.phoneBg} ${s.phoneBorder}`}
      >
        <header className={`shrink-0 ${s.headerBg}`}>
          <div className="flex items-center gap-3 px-4 pb-3 pt-3">
            <Link
              href="/"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/5 ${s.icon}`}
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </Link>
            <h1 className={`text-lg font-semibold ${s.titleText}`}>About</h1>
          </div>
        </header>

        <section className={`relative flex min-h-0 flex-1 flex-col overflow-y-auto ${s.bodyBg}`}>
          <div
            className={`pointer-events-none absolute inset-0 opacity-30 [background-size:24px_24px] ${s.dotPattern}`}
          />

          <div className="relative space-y-8 px-5 py-6">
            <div className="space-y-2">
              <h2 className={`text-xl font-bold ${s.titleText}`}>chat-read</h2>
              <p className={`text-sm leading-relaxed ${s.mutedText}`}>
                Turn any document into a chat-style reading experience. Upload a PDF, snap a photo,
                or paste a link — we extract the text and serve it back as bite-sized chat bubbles
                you can scroll through like a conversation.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${s.mutedText}`}>
                How it works
              </h3>
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div
                    key={step.title}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${s.cardBorder}`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#005c4b] text-white">
                      <step.icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${s.titleText}`}>
                        {i + 1}. {step.title}
                      </p>
                      <p className={`mt-0.5 text-xs leading-relaxed ${s.mutedText}`}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-[#005c4b]" />
                <h3 className={`text-xs font-semibold uppercase tracking-wide ${s.mutedText}`}>
                  Local-first &amp; private
                </h3>
              </div>
              <p className={`text-sm leading-relaxed ${s.mutedText}`}>
                Your documents never leave your device. All extracted text, chunks, and bookmarks
                are stored in your browser using Dexie (IndexedDB). There is no server database, no
                account, and no telemetry. If you clear your browser data, it&apos;s gone — we
                don&apos;t have a copy.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${s.mutedText}`}>
                Tech stack
              </h3>
              <div className="space-y-2">
                <div
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${s.cardBorder}`}
                >
                  <Database size={14} className={`mt-0.5 shrink-0 ${s.icon}`} />
                  <div>
                    <p className={`text-sm font-medium ${s.titleText}`}>Dexie (IndexedDB)</p>
                    <p className={`text-xs ${s.mutedText}`}>
                      Local-first storage — everything lives in your browser
                    </p>
                  </div>
                </div>
                <div
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${s.cardBorder}`}
                >
                  <ScanText size={14} className={`mt-0.5 shrink-0 ${s.icon}`} />
                  <div>
                    <p className={`text-sm font-medium ${s.titleText}`}>Mistral OCR</p>
                    <p className={`text-xs ${s.mutedText}`}>
                      AI-powered text extraction from PDFs, images, and documents
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
