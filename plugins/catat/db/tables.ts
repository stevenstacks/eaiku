import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Must match db/migrations. The FTS table is queried with raw SQL (Drizzle has no FTS5 support).
export const catatNotes = sqliteTable("catat_notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  videoId: text("video_id").notNull(),
  channel: text("channel"),
  style: text("style").notNull(),
  startSec: real("start_sec").notNull(),
  endSec: real("end_sec").notNull(),
  seriesId: text("series_id"),
  part: integer("part"),
  total: integer("total"),
  hook: text("hook").notNull(),
  keyTakeaway: text("key_takeaway").notNull(),
  createdAt: text("created_at").notNull(),
  path: text("path").notNull(),
});

export const catatNoteTags = sqliteTable(
  "catat_note_tags",
  {
    noteId: text("note_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tag] })],
);
