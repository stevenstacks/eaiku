import { describe, expect, it } from "vitest";
import { parseChapters } from "./chapters";

const html = [
  '..."chapterRenderer":{"title":{"simpleText":"Intro"},"timeRangeStartMillis":0,...',
  '..."chapterRenderer":{"title":{"simpleText":"Tokenization \\u0026 BPE"},"timeRangeStartMillis":760000,...',
  // YouTube repeats chapter data in the page. Duplicates must be removed.
  '..."chapterRenderer":{"title":{"simpleText":"Intro"},"timeRangeStartMillis":0,...',
].join("");

describe("parseChapters", () => {
  it("reads chapter titles and start times, without duplicates", () => {
    expect(parseChapters(html)).toEqual([
      { title: "Intro", startSec: 0 },
      { title: "Tokenization & BPE", startSec: 760 },
    ]);
  });

  it("returns [] when the page has no chapters", () => {
    expect(parseChapters("<html></html>")).toEqual([]);
  });
});
