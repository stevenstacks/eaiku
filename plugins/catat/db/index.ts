import { fileURLToPath } from "node:url";
import type { Sqlite } from "@eaiku/core";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Note } from "../schema/note";
import { catatNotes, catatNoteTags } from "./tables";

export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

export function indexNote(sqlite: Sqlite, note: Note, notePath: string): void {
  if (note.source.type !== "youtube") throw new Error("v0.1 indexes YouTube notes only.");
  const db = drizzle(sqlite);
  const row = {
    id: note.id,
    title: note.title,
    videoId: note.source.videoId,
    channel: note.source.channel ?? null,
    style: note.style,
    startSec: note.source.range.startSec,
    endSec: note.source.range.endSec,
    seriesId: note.series?.id ?? null,
    part: note.series?.part ?? null,
    total: note.series?.total ?? null,
    hook: note.hook,
    keyTakeaway: note.keyTakeaway,
    createdAt: note.createdAt,
    path: notePath,
  };
  const sectionsText = note.sections.map((s) => [s.heading, s.body, s.analogy ?? ""].join("\n")).join("\n\n");
  const conceptsText = note.concepts.map((c) => `${c.term}: ${c.definition}`).join("\n");
  const tags = [...new Set(note.tags)];

  sqlite.transaction(() => {
    db.insert(catatNotes).values(row).onConflictDoUpdate({ target: catatNotes.id, set: row }).run();
    db.delete(catatNoteTags).where(eq(catatNoteTags.noteId, note.id)).run();
    if (tags.length > 0) db.insert(catatNoteTags).values(tags.map((tag) => ({ noteId: note.id, tag }))).run();
    sqlite.prepare("DELETE FROM catat_notes_fts WHERE note_id = ?").run(note.id);
    sqlite
      .prepare(
        "INSERT INTO catat_notes_fts (note_id, title, hook, key_takeaway, sections_text, concepts_text) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(note.id, note.title, note.hook, note.keyTakeaway, sectionsText, conceptsText);
  })();
}

export function clearIndex(sqlite: Sqlite): void {
  sqlite.exec("DELETE FROM catat_note_tags; DELETE FROM catat_notes; DELETE FROM catat_notes_fts;");
}

export interface SavedPart {
  id: string;
  part: number;
  startSec: number;
  endSec: number;
}

// Saved parts of one video, in part order. `plan` uses them so the next part starts where
// the saved part really ended (no overlap from the 5-minute buffer).
export function getSeriesParts(sqlite: Sqlite, seriesId: string, excludeNoteId?: string): SavedPart[] {
  const rows = sqlite
    .prepare(
      "SELECT id, part, start_sec AS startSec, end_sec AS endSec FROM catat_notes WHERE series_id = ? AND part IS NOT NULL ORDER BY part",
    )
    .all(seriesId) as SavedPart[];
  return rows.filter((row) => row.id !== excludeNoteId);
}
