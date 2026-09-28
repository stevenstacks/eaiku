import { CommandError, createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { indexNote, MIGRATIONS_DIR } from "../db";
import { makeLongTranscript, makeNote, youtubeSource } from "../test/fixtures";
import { planCommand } from "./plan";

function setup() {
  return createContext({ id: "catat", migrationsDir: MIGRATIONS_DIR }, makeTempHome());
}

describe("planCommand", () => {
  it("returns a labelled plan whose next part starts after the saved part", async () => {
    const ctx = setup();
    const long = makeLongTranscript();
    await ctx.storage.writeJson(`transcripts/${long.videoId}.json`, long);
    indexNote(
      ctx.db,
      makeNote({
        id: "tokens-p1",
        source: youtubeSource({ durationSec: 1799, range: { startSec: 0, endSec: 820 } }),
        series: { id: long.videoId, part: 1, total: 3, partTitle: "Intro" },
      }),
      "/x/note.json",
    );

    const result = await planCommand([long.videoId], ctx);
    expect(result).toMatchObject({ videoId: "abcdefghijk", durationLabel: "29:59", mode: "grid", total: 3 });
    expect((result as { parts: unknown[] }).parts.slice(0, 2)).toEqual([
      {
        part: 1, startSec: 0, endSec: 820, readUntilSec: 820, savedNoteId: "tokens-p1",
        startLabel: "0:00", endLabel: "13:40", readUntilLabel: "13:40",
      },
      {
        part: 2, startSec: 820, endSec: 1195, readUntilSec: 1495,
        startLabel: "13:40", endLabel: "19:55", readUntilLabel: "24:55",
      },
    ]);
  });

  it("fails clearly when the transcript was not fetched", async () => {
    await expect(planCommand(["abcdefghijk"], setup())).rejects.toBeInstanceOf(CommandError);
  });
});
