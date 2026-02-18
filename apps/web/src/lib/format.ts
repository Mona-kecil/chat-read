export const formatDocTitle = (sourceName?: string, sourceUrl?: string): string => {
  if (sourceName) {
    const withoutExt = sourceName.replace(/\.[^.]+$/, "");
    return (
      withoutExt
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim() || sourceName
    );
  }

  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      const host = url.hostname.replace(/^www\./, "");
      const path = url.pathname.replace(/\/$/, "");
      if (host === "x.com" || host === "twitter.com") {
        const segments = path.split("/").filter(Boolean);
        if (segments[0]) {
          return `@${segments[0]}`;
        }
      }
      if (!path || path === "/") {
        return host;
      }
      const lastSegment = path.split("/").filter(Boolean).pop() ?? "";
      const clean = decodeURIComponent(lastSegment)
        .replace(/[-_]+/g, " ")
        .replace(/\.[^.]+$/, "");
      return `${host} › ${clean || path}`;
    } catch {
      return sourceUrl;
    }
  }

  return "OCR upload";
};

export const getDisplayTitle = (
  contentTitle?: string,
  sourceName?: string,
  sourceUrl?: string,
): string => contentTitle || formatDocTitle(sourceName, sourceUrl);
