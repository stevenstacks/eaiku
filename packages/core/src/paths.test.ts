import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHome } from "./paths";

describe("resolveHome", () => {
  it("defaults to ~/eaiku", () => {
    expect(resolveHome({})).toBe(path.join(os.homedir(), "eaiku"));
  });

  it("uses EAIKU_HOME and expands ~", () => {
    expect(resolveHome({ EAIKU_HOME: "~/notes-home" })).toBe(path.join(os.homedir(), "notes-home"));
    expect(resolveHome({ EAIKU_HOME: "/tmp/x" })).toBe("/tmp/x");
  });
});
