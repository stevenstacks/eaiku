import type { PluginCommand } from "@eaiku/core";
import { clearIndex, indexNote } from "../db";
import { Note } from "../schema/note";

// The note files are the source of truth. The database can always be rebuilt from them.
export const reindexCommand: PluginCommand = async (_args, ctx) => {
  const skipped: { id: string; reason: string }[] = [];
  const notes: { note: Note; path: string }[] = [];

  for (const id of await ctx.storage.list("notes")) {
    const rel = `notes/${id}/note.json`;
    const parsed = Note.safeParse(await ctx.storage.readJson(rel));
    if (parsed.success) notes.push({ note: parsed.data, path: ctx.storage.path(rel) });
    else skipped.push({ id, reason: "does not match the note schema" });
  }

  ctx.db.transaction(() => {
    clearIndex(ctx.db);
    for (const { note, path } of notes) indexNote(ctx.db, note, path);
  })();

  return { indexed: notes.length, skipped };
};
