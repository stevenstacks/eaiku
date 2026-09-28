import { createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { makeNote, youtubeSource } from "../test/fixtures";
import { clearIndex, getSeriesParts, indexNote, MIGRATIONS_DIR } from "./index";

function setup() {
  return createContext({ id: "catat", migrationsDir: MIGRATIONS_DIR }, makeTempHome());
}

describe("indexNote", () => {
  it("writes the note row, tags, and full-text row", () => {
    const { db } = setup();
    indexNote(db, makeNote(), "/x/note.json");

    expect(db.prepare("SELECT id, video_id, start_sec, end_sec FROM catat_notes").all()).toEqual([
      { id: "2026-09-28-tokens-101", video_id: "abcdefghijk", start_sec: 0, end_sec: 80 },
    ]);
    expect(db.prepare("SELECT tag FROM catat_note_tags ORDER BY tag").all()).toEqual([
      { tag: "llm" },
      { tag: "tokens" },
    ]);
    expect(
      db.prepare("SELECT note_id FROM catat_notes_fts WHERE catat_notes_fts MATCH ?").all("pizza"),
    ).toEqual([{ note_id: "2026-09-28-tokens-101" }]);
  });

  it("replaces old rows when the same note is indexed again", () => {
    const { db } = setup();
    indexNote(db, makeNote(), "/x/note.json");
    indexNote(db, makeNote({ tags: ["new"] }), "/x/note.json");

    expect(db.prepare("SELECT count(*) AS n FROM catat_notes").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT tag FROM catat_note_tags").all()).toEqual([{ tag: "new" }]);
    expect(db.prepare("SELECT count(*) AS n FROM catat_notes_fts").get()).toEqual({ n: 1 });
  });

  it("getSeriesParts returns the saved parts of a series, without the excluded note", () => {
    const { db } = setup();
    const part = (n: number, startSec: number, endSec: number) =>
      makeNote({
        id: `tokens-p${n}`,
        source: youtubeSource({ range: { startSec, endSec } }),
        series: { id: "abcdefghijk", part: n, total: 3, partTitle: `Part ${n}` },
      });
    indexNote(db, part(2, 30, 60), "/x/2.json");
    indexNote(db, part(1, 0, 30), "/x/1.json");

    expect(getSeriesParts(db, "abcdefghijk")).toEqual([
      { id: "tokens-p1", part: 1, startSec: 0, endSec: 30 },
      { id: "tokens-p2", part: 2, startSec: 30, endSec: 60 },
    ]);
    expect(getSeriesParts(db, "abcdefghijk", "tokens-p2")).toEqual([
      { id: "tokens-p1", part: 1, startSec: 0, endSec: 30 },
    ]);
  });

  it("clearIndex empties all catat tables", () => {
    const { db } = setup();
    indexNote(db, makeNote(), "/x/note.json");
    clearIndex(db);
    expect(db.prepare("SELECT count(*) AS n FROM catat_notes").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM catat_notes_fts").get()).toEqual({ n: 0 });
  });
});
