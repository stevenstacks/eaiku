import { describe, expect, it } from "vitest";
import type { Segment } from "./transcript";
import { buildParts, snapCut } from "./snap";

// Pauses before each segment: B=2s, C=8s, D=1s.
const segments: Segment[] = [
  { startSec: 0, durSec: 10, text: "a" },
  { startSec: 12, durSec: 10, text: "b" },
  { startSec: 30, durSec: 5, text: "c" },
  { startSec: 36, durSec: 5, text: "d" },
];

describe("snapCut", () => {
  it("moves the cut to the start of the segment after the longest pause", () => {
    expect(snapCut(segments, 25, 120)).toBe(30);
  });

  it("only looks inside the window", () => {
    expect(snapCut(segments, 13, 2)).toBe(12);
  });

  it("keeps the cut when no segment starts inside the window", () => {
    expect(snapCut(segments, 100, 5)).toBe(100);
  });
});

describe("buildParts", () => {
  it("turns cuts into ordered parts that cover the whole video", () => {
    expect(buildParts([60, 30, 30, 0, 150], 100)).toEqual([
      { part: 1, startSec: 0, endSec: 30 },
      { part: 2, startSec: 30, endSec: 60 },
      { part: 3, startSec: 60, endSec: 100 },
    ]);
  });
});
