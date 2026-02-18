"use client";

import { useEffect, useRef } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

type BubbleContextMenuProps = {
  isBookmarked: boolean;
  onBookmark: () => void;
  onDelete: () => void;
  onClose: () => void;
  position: { x: number; y: number };
};

export function BubbleContextMenu({
  isBookmarked,
  onBookmark,
  onDelete,
  onClose,
  position,
}: BubbleContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, theme } = useTheme();
  const activeTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = activeTheme !== "light";

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  const menuWidth = 180;
  const menuHeight = 96;
  const padding = 8;

  let left = position.x - menuWidth / 2;
  let top = position.y - menuHeight - padding;

  if (typeof window !== "undefined") {
    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (top < padding) {
      top = position.y + padding;
    }
  }

  const s = {
    menuBg: isDark ? "bg-[#1f2c34]" : "bg-white",
    menuBorder: isDark ? "border-[#2a3942]" : "border-[#d1d7db]",
    menuText: isDark ? "text-[#e9edef]" : "text-[#111b21]",
    menuHover: isDark ? "hover:bg-[#2a3942]" : "hover:bg-[#f0f2f5]",
    backdrop: "bg-black/30",
  };

  return (
    <div className={`fixed inset-0 z-50 ${s.backdrop}`} aria-modal="true">
      <div
        ref={menuRef}
        className={`absolute rounded-xl border shadow-lg ${s.menuBg} ${s.menuBorder}`}
        style={{ left, top, width: menuWidth }}
      >
        <button
          type="button"
          className={`flex w-full items-center gap-3 rounded-t-xl px-4 py-3 text-sm ${s.menuText} ${s.menuHover} transition`}
          onClick={() => {
            onBookmark();
            onClose();
          }}
        >
          <Bookmark size={16} className={isBookmarked ? "fill-current" : ""} />
          {isBookmarked ? "Unbookmark" : "Bookmark"}
        </button>
        <button
          type="button"
          className={`flex w-full items-center gap-3 rounded-b-xl px-4 py-3 text-sm text-[#ea3434] ${s.menuHover} transition`}
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </div>
  );
}
