import { describe, expect, it } from "vitest";
import { makeNote } from "../test/fixtures";
import { Note } from "./note";

describe("Note schema", () => {
  it("accepts a valid note", () => {
    expect(Note.safeParse(makeNote()).success).toBe(true);
  });

  it("rejects fewer than 3 sections", () => {
    const note = makeNote();
    expect(Note.safeParse({ ...note, sections: note.sections.slice(0, 2) }).success).toBe(false);
  });

  it("rejects a hook longer than 280 characters", () => {
    expect(Note.safeParse(makeNote({ hook: "x".repeat(281) })).success).toBe(false);
  });

  it("rejects a section without refs", () => {
    const note = makeNote();
    const sections = note.sections.map((s, i) => (i === 0 ? { ...s, refs: [] } : s));
    expect(Note.safeParse({ ...note, sections }).success).toBe(false);
  });

  it("rejects an id that is not a kebab-case slug", () => {
    expect(Note.safeParse(makeNote({ id: "Bad Id/../x" })).success).toBe(false);
  });
});
