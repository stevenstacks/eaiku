import { createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { clearIndex, MIGRATIONS_DIR } from "../db";
import { makeNote } from "../test/fixtures";
import { reindexCommand } from "./reindex";

describe("reindexCommand", () => {
  it("rebuilds the index from note files and skips broken files", async () => {
    const ctx = createContext({ id: "catat", migrationsDir: MIGRATIONS_DIR }, makeTempHome());
    await ctx.storage.writeJson("notes/2026-09-28-tokens-101/note.json", makeNote());
    await ctx.storage.writeJson("notes/broken/note.json", { hello: "world" });
    clearIndex(ctx.db);

    expect(await reindexCommand([], ctx)).toEqual({
      indexed: 1,
      skipped: [{ id: "broken", reason: "does not match the note schema" }],
    });
    expect(ctx.db.prepare("SELECT id FROM catat_notes").all()).toEqual([{ id: "2026-09-28-tokens-101" }]);
  });
});
