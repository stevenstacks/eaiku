import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eaiku-test-"));
}
