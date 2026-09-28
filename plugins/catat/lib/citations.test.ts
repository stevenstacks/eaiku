import { describe, expect, it } from "vitest";
import { makeNote, transcript } from "../test/fixtures";
import { checkCitations } from "./citations";

describe("checkCitations", () => {
  it("passes a note whose refs are in range and whose quotes exist", () => {
    expect(checkCitations(makeNote(), transcript)).toEqual([]);
  });

  it("ignores case and punctuation in quotes", () => {
    const note = makeNote();
    note.sections[0].refs = [{ kind: "timestamp", startSec: 4, quote: "A TOKENIZER, splits... text!" }];
    expect(checkCitations(note, transcript)).toEqual([]);
  });

  it("reports a quote that is not near its timestamp", () => {
    const note = makeNote();
    note.sections[0].refs = [{ kind: "timestamp", startSec: 70, quote: "a tokenizer splits text" }];
    expect(checkCitations(note, transcript)).toEqual([
      { path: "sections[0].refs[0]", message: expect.stringContaining("not found in the transcript near 1:10") },
    ]);
  });

  it("reports a timestamp outside the note range", () => {
    const base = makeNote();
    if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
    const note = makeNote({ source: { ...base.source, range: { startSec: 0, endSec: 30 } } });
    const errors = checkCitations(note, transcript);
    expect(errors.map((e) => e.path)).toEqual(["sections[2].refs[0]", "concepts[2].refs[0]"]);
    expect(errors[0].message).toContain("outside the note range 0:00–0:30");
  });

  it("reports a range longer than the video", () => {
    const base = makeNote();
    if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
    const note = makeNote({ source: { ...base.source, range: { startSec: 0, endSec: 500 } } });
    expect(checkCitations(note, transcript)[0]).toEqual({
      path: "source.range",
      message: expect.stringContaining("must be inside the video"),
    });
  });
});
