import fs from "node:fs";
import { createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../db";
import type { TranscriptFile } from "../lib/transcript";
import { makeLongTranscript, makeNote, transcript, youtubeSource } from "../test/fixtures";
import { saveCommand } from "./save";

async function setup(draft: unknown, t: TranscriptFile = transcript) {
  const ctx = createContext({ id: "catat", migrationsDir: MIGRATIONS_DIR }, makeTempHome());
  await ctx.storage.writeJson(`transcripts/${t.videoId}.json`, t);
  await ctx.storage.writeJson("drafts/draft.json", draft);
  return { ctx, draftPath: ctx.storage.path("drafts/draft.json") };
}

describe("saveCommand", () => {
  it("saves a valid note, indexes it, and deletes the draft", async () => {
    const { ctx, draftPath } = await setup(makeNote());
    const result = await saveCommand([draftPath], ctx);

    expect(result).toEqual({
      noteId: "2026-09-28-tokens-101",
      path: ctx.storage.path("notes/2026-09-28-tokens-101/note.json"),
      url: "http://localhost:3000/p/catat/2026-09-28-tokens-101",
    });
    expect(await ctx.storage.readJson("notes/2026-09-28-tokens-101/note.json")).toEqual(makeNote());
    expect(ctx.db.prepare("SELECT count(*) AS n FROM catat_notes").get()).toEqual({ n: 1 });
    expect(fs.existsSync(draftPath)).toBe(false);
  });

  it("rejects a draft that breaks the schema and keeps the draft", async () => {
    const { ctx, draftPath } = await setup({ ...makeNote(), sections: [] });
    await expect(saveCommand([draftPath], ctx)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
      details: { issues: expect.arrayContaining([expect.objectContaining({ path: "sections" })]) },
    });
    expect(fs.existsSync(draftPath)).toBe(true);
  });

  it("rejects a series part that does not match the plan", async () => {
    const long = makeLongTranscript();
    const note = makeNote({
      source: youtubeSource({ durationSec: 1799, range: { startSec: 0, endSec: 1000 } }),
      series: { id: long.videoId, part: 1, total: 3, partTitle: "Intro" },
    });
    const { ctx, draftPath } = await setup(note, long);
    await expect(saveCommand([draftPath], ctx)).rejects.toMatchObject({
      code: "PLAN_MISMATCH",
      message: expect.stringContaining("15:10"),
    });
  });

  it("rejects a draft with a wrong quote", async () => {
    const note = makeNote();
    note.sections[1].refs = [{ kind: "timestamp", startSec: 9, quote: "words that were never said" }];
    const { ctx, draftPath } = await setup(note);
    await expect(saveCommand([draftPath], ctx)).rejects.toMatchObject({
      code: "CITATIONS_INVALID",
      details: { errors: [expect.objectContaining({ path: "sections[1].refs[0]" })] },
    });
  });

  it("rejects a file that is not JSON", async () => {
    const { ctx } = await setup({});
    await ctx.storage.writeText("drafts/bad.json", "{ not json");
    await expect(saveCommand([ctx.storage.path("drafts/bad.json")], ctx)).rejects.toMatchObject({
      code: "INVALID_JSON",
    });
  });
});
