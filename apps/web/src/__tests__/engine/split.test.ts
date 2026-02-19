import { describe, expect, it } from "vitest";

import { splitIntoSentences } from "@/lib/engine/split";

describe("splitIntoSentences", () => {
  it("should not split after common abbreviations", () => {
    const sentences = splitIntoSentences("Dr. Smith went home. He slept.");

    expect(sentences.map((sentence) => sentence.text)).toEqual([
      "Dr. Smith went home.",
      "He slept.",
    ]);
  });

  it("should not split inside initialisms", () => {
    const sentences = splitIntoSentences("U.S.A. is big. Really!");

    expect(sentences.map((sentence) => sentence.text)).toEqual(["U.S.A. is big.", "Really!"]);
  });

  it("should not split at decimal points", () => {
    const sentences = splitIntoSentences("Pi is 3.14. Next sentence.");

    expect(sentences.map((sentence) => sentence.text)).toEqual(["Pi is 3.14.", "Next sentence."]);
  });

  it("should treat ellipses as part of the current sentence", () => {
    const sentences = splitIntoSentences("Wait... what? Ok.");

    expect(sentences.map((sentence) => sentence.text)).toEqual(["Wait... what?", "Ok."]);
  });

  it("should include closing punctuation in the sentence", () => {
    const sentences = splitIntoSentences('He said "Hi." Then left.');

    expect(sentences.map((sentence) => sentence.text)).toEqual(['He said "Hi."', "Then left."]);
  });
});
