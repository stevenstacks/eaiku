import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { run } from "./run";

describe("run", () => {
  it("rejects an unknown plugin with a usage error", async () => {
    await expect(run(["nope"], makeTempHome())).rejects.toMatchObject({ code: "USAGE" });
  });

  it("rejects an unknown command and lists the real ones", async () => {
    await expect(run(["catat", "nope"], makeTempHome())).rejects.toMatchObject({
      code: "USAGE",
      message: expect.stringContaining("fetch, plan, read, save, reindex"),
    });
  });

  it("runs reindex for every plugin", async () => {
    expect(await run(["reindex"], makeTempHome())).toEqual({ catat: { indexed: 0, skipped: [] } });
  });
});
