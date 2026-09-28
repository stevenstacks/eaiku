import { describe, expect, it } from "vitest";
import { makeLongTranscript, makeNote, transcript, youtubeSource } from "../test/fixtures";
import { checkSeriesRange, computePlan } from "./plan";

describe("computePlan", () => {
  it("makes one part for a video of 10 minutes or less", () => {
    expect(computePlan(transcript)).toEqual({
      mode: "single",
      total: 1,
      parts: [{ part: 1, startSec: 0, endSec: 80, readUntilSec: 80 }],
    });
  });

  it("uses chapters, with no buffer", () => {
    const plan = computePlan({
      ...makeLongTranscript(),
      chapters: [
        { title: "Intro", startSec: 0 },
        { title: "Middle", startSec: 900 },
      ],
    });
    expect(plan).toEqual({
      mode: "chapters",
      total: 2,
      parts: [
        { part: 1, startSec: 0, endSec: 900, readUntilSec: 900, title: "Intro" },
        { part: 2, startSec: 900, endSec: 1799, readUntilSec: 1799, title: "Middle" },
      ],
    });
  });

  it("cuts every 10 minutes at the nearest long pause and adds a 5-minute buffer", () => {
    expect(computePlan(makeLongTranscript())).toEqual({
      mode: "grid",
      total: 3,
      parts: [
        { part: 1, startSec: 0, endSec: 610, readUntilSec: 910 },
        { part: 2, startSec: 610, endSec: 1195, readUntilSec: 1495 },
        { part: 3, startSec: 1195, endSec: 1799, readUntilSec: 1799 },
      ],
    });
  });

  it("starts the next part where the saved part really ended", () => {
    const plan = computePlan(makeLongTranscript(), [{ id: "p1", part: 1, startSec: 0, endSec: 820 }]);
    expect(plan.parts.slice(0, 2)).toEqual([
      { part: 1, startSec: 0, endSec: 820, readUntilSec: 820, savedNoteId: "p1" },
      { part: 2, startSec: 820, endSec: 1195, readUntilSec: 1495 },
    ]);
  });
});

describe("checkSeriesRange", () => {
  const plan = computePlan(makeLongTranscript());
  const partNote = (startSec: number, endSec: number, part = 1, total = 3) =>
    makeNote({
      source: youtubeSource({ durationSec: 1799, range: { startSec, endSec } }),
      series: { id: "abcdefghijk", part, total, partTitle: "Intro" },
    });

  it("accepts a part that ends inside the buffer", () => {
    expect(checkSeriesRange(partNote(0, 820), plan)).toBeNull();
  });

  it("rejects a part that ends after the buffer", () => {
    expect(checkSeriesRange(partNote(0, 1000), plan)).toContain("must end at or before 15:10");
  });

  it("rejects a part with the wrong start", () => {
    expect(checkSeriesRange(partNote(600, 900, 2), plan)).toContain("must start at 10:10");
  });

  it("rejects a wrong total", () => {
    expect(checkSeriesRange(partNote(0, 820, 1, 5), plan)).toContain("series.total must be 3");
  });

  it("ignores notes without a series", () => {
    expect(checkSeriesRange(makeNote(), plan)).toBeNull();
  });
});
