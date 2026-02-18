import { describe, expect, it } from "vitest";
import { getDisplayTitle, formatDocTitle } from "@/lib/format";

describe("getDisplayTitle", () => {
  it("should return contentTitle when present", () => {
    const title = getDisplayTitle("LLM Generated Title", "report.pdf", undefined);
    expect(title).toBe("LLM Generated Title");
  });

  it("should fall back to formatDocTitle when contentTitle is undefined", () => {
    const title = getDisplayTitle(undefined, "my-report.pdf", undefined);
    expect(title).toBe(formatDocTitle("my-report.pdf", undefined));
  });

  it("should fall back to formatDocTitle with sourceUrl when no sourceName", () => {
    const title = getDisplayTitle(undefined, undefined, "https://x.com/openforage/status/123");
    expect(title).toBe("@openforage");
  });

  it("should return OCR upload when nothing is available", () => {
    const title = getDisplayTitle(undefined, undefined, undefined);
    expect(title).toBe("OCR upload");
  });
});
