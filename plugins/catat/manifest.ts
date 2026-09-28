import type { EaikuPlugin } from "@eaiku/core";
import { fetchCommand } from "./cli/fetch";
import { planCommand } from "./cli/plan";
import { readCommand } from "./cli/read";
import { reindexCommand } from "./cli/reindex";
import { saveCommand } from "./cli/save";
import { MIGRATIONS_DIR } from "./db";

export const catat: EaikuPlugin = {
  id: "catat",
  name: "Catat",
  description: "Turn YouTube videos into notes that explain, not compress.",
  version: "0.1.0",
  icon: "notebook-pen",
  migrationsDir: MIGRATIONS_DIR,
  launcherActions: [
    { label: "New note", kind: "copyCommand", command: "/catat " },
    { label: "My notes", kind: "route", href: "/p/catat" },
  ],
  healthChecks: [
    {
      label: "YouTube reachable",
      run: async () => {
        try {
          const res = await fetch("https://www.youtube.com/", { method: "HEAD", signal: AbortSignal.timeout(5000) });
          return res.ok ? { ok: true } : { ok: false, hint: `YouTube answered with HTTP ${res.status}.` };
        } catch {
          return { ok: false, hint: "Cannot reach youtube.com. Check your network." };
        }
      },
    },
    {
      label: "Database ready",
      run: async (ctx) => {
        const row = ctx.db.prepare("SELECT count(*) AS n FROM catat_notes").get() as { n: number };
        return { ok: true, hint: `${row.n} notes indexed.` };
      },
    },
  ],
  commands: {
    fetch: fetchCommand,
    plan: planCommand,
    read: readCommand,
    save: saveCommand,
    reindex: reindexCommand,
  },
};
