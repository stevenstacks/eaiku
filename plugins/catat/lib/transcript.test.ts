import { describe, expect, it } from "vitest";
import { decodeEntities, groupLines, toSegments, toTranscriptText } from "./transcript";

describe("toSegments", () => {
  it("converts milliseconds to seconds and decodes entities", () => {
    expect(toSegments([{ text: "it&amp;#39;s\nhere", duration: 1180, offset: 4220 }])).toEqual([
      { startSec: 4.22, durSec: 1.18, text: "it's here" },
    ]);
  });
});

describe("decodeEntities", () => {
  it("decodes nested and named entities", () => {
    expect(decodeEntities("a &amp;amp; b &quot;c&quot; &lt;d&gt;")).toBe('a & b "c" <d>');
  });
});

describe("groupLines", () => {
  it("ends a line at a sentence end once it is long enough", () => {
    const lines = groupLines(
      [
        { startSec: 0, durSec: 2, text: "Hello there friend." },
        { startSec: 2, durSec: 2, text: "Next one here." },
      ],
      220,
      10,
    );
    expect(lines).toEqual([
      { startSec: 0, endSec: 2, text: "Hello there friend." },
      { startSec: 2, endSec: 4, text: "Next one here." },
    ]);
  });

  it("splits unpunctuated auto-captions at maxChars", () => {
    const a = "a".repeat(30);
    const lines = groupLines(
      [
        { startSec: 0, durSec: 3, text: a },
        { startSec: 3, durSec: 3, text: a },
        { startSec: 6, durSec: 3, text: a },
      ],
      60,
    );
    expect(lines.map((l) => l.startSec)).toEqual([0, 6]);
  });
});

describe("toTranscriptText", () => {
  it("prefixes each line with its timestamp", () => {
    expect(toTranscriptText([{ startSec: 760, endSec: 765, text: "so the tokenizer" }])).toBe(
      "[12:40] so the tokenizer\n",
    );
  });
});
