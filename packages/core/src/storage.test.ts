import { describe, expect, it } from "vitest";
import { createStorage } from "./storage";
import { makeTempHome } from "./testing";

describe("createStorage", () => {
  it("round-trips JSON inside the plugin folder", async () => {
    const storage = createStorage(makeTempHome(), "catat");
    await storage.writeJson("notes/a/note.json", { hello: "world" });
    expect(await storage.readJson("notes/a/note.json")).toEqual({ hello: "world" });
    expect(await storage.list("notes")).toEqual(["a"]);
  });

  it("returns undefined and [] for missing paths", async () => {
    const storage = createStorage(makeTempHome(), "catat");
    expect(await storage.readJson("missing.json")).toBeUndefined();
    expect(await storage.list("missing")).toEqual([]);
  });

  it("blocks paths that escape the plugin folder", () => {
    const storage = createStorage(makeTempHome(), "catat");
    expect(() => storage.path("../other/file.json")).toThrow("escapes plugin storage");
  });
});
