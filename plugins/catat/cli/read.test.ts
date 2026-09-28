import { createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../db";
import { transcript } from "../test/fixtures";
import { readCommand } from "./read";

describe("readCommand", () => {
  it("returns only the transcript lines inside the range", async () => {
    const ctx = createContext({ id: "catat", migrationsDir: MIGRATIONS_DIR }, makeTempHome());
    await ctx.storage.writeJson(`transcripts/${transcript.videoId}.json`, transcript);

    const result = (await readCommand([transcript.videoId, "--from", "0:04", "--to", "0:40"], ctx)) as {
      text: string;
    };
    expect(result).toMatchObject({ videoId: "abcdefghijk", from: "0:04", to: "0:40" });
    expect(result.text).toBe("[0:04] a tokenizer splits text into small pieces each piece is mapped to a number\n");
  });
});
