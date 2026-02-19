import { describe, expect, it } from "vitest";

import { isHttpUrl } from "@/lib/url";

describe("isHttpUrl", () => {
  it("should accept http and https", () => {
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("should reject non-http(s) protocols", () => {
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("should reject invalid urls", () => {
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});
