# eaiku Plan 01: Catat Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/catat <youtube-url>` in Claude Code fetches captions, plans parts for long videos, writes a note, validates it, checks its citations, and saves it to `~/eaiku` (JSON file + SQLite index).

**Architecture:** A pnpm monorepo. `packages/core` holds the plugin contract, storage, and the SQLite migration runner. `plugins/catat` holds the note schema, the pure logic (transcript, snap, citations), the SQLite index, and the CLI commands. `packages/cli` exposes the `eaiku` command. The Claude Code skill in `plugins/catat/claude` tells the agent to call the CLI. The agent does the thinking; the CLI does the deterministic work.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), tsx, Vitest, Zod, better-sqlite3, Drizzle ORM, youtube-transcript, ESLint, commitlint, husky, semantic-release.

**Spec:** `docs/superpowers/specs/2026-09-28-eaiku-v0.1-design.md`

**Out of scope for this plan:** the web app (Plan 02), Turborepo (added in Plan 02 when there is a build to cache), demo data and deploy (Plan 03).

---

## File map

```
eaiku/
├─ package.json                      root scripts, dev deps, pnpm build allowlist
├─ pnpm-workspace.yaml
├─ tsconfig.base.json / tsconfig.json
├─ vitest.config.ts
├─ eslint.config.js
├─ commitlint.config.js
├─ .releaserc.json
├─ .husky/commit-msg
├─ .github/workflows/ci.yml, release.yml
├─ .claude-plugin/marketplace.json
├─ packages/
│  ├─ core/src/
│  │  ├─ errors.ts                   CommandError
│  │  ├─ paths.ts                    resolveHome()
│  │  ├─ storage.ts                  per-plugin file storage
│  │  ├─ db.ts                       openDb(), runMigrations()
│  │  ├─ plugin.ts                   EaikuPlugin types, createContext()
│  │  ├─ testing.ts                  makeTempHome()
│  │  └─ index.ts
│  └─ cli/
│     ├─ bin/eaiku.js                global bin (tsx loader)
│     └─ src/ plugins.ts, run.ts, doctor.ts, main.ts
└─ plugins/catat/
   ├─ manifest.ts
   ├─ schema/note.ts                 Zod contract
   ├─ lib/
   │  ├─ time.ts                     formatTimestamp, parseTimestamp
   │  ├─ video-id.ts                 parseVideoId
   │  ├─ transcript.ts               Segment, TranscriptFile, toSegments, groupLines, toTranscriptText
   │  ├─ chapters.ts                 parseChapters (pure)
   │  ├─ youtube.ts                  the ONLY file that calls YouTube / youtube-transcript
   │  ├─ snap.ts                     snapCut, buildParts
   │  ├─ plan.ts                     computePlan (single / chapters / grid + buffer), checkSeriesRange
   │  └─ citations.ts                checkCitations
   ├─ db/
   │  ├─ migrations/0001_init.sql
   │  ├─ tables.ts                   Drizzle tables
   │  └─ index.ts                    MIGRATIONS_DIR, indexNote, clearIndex, getSeriesParts
   ├─ cli/ shared.ts, fetch.ts, plan.ts, read.ts, save.ts, reindex.ts
   ├─ scripts/smoke.ts, preview.ts   Day 1 live checks, transcript preview
   ├─ test/fixtures.ts
   └─ claude/
      ├─ .claude-plugin/plugin.json
      └─ skills/catat/SKILL.md
```

Tests sit next to the code as `*.test.ts`.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.nvmrc`

- [ ] **Step 1: Create the root files**

`package.json`:

```json
{
  "name": "eaiku",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc -p tsconfig.json",
    "lint": "eslint .",
    "eaiku": "tsx packages/cli/src/main.ts"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "esbuild"]
  }
}
```

`onlyBuiltDependencies` matters: pnpm 10 blocks install scripts by default, and `better-sqlite3` needs its install script to get its native binary.

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "plugins/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "include": ["packages/**/*.ts", "plugins/**/*.ts", "vitest.config.ts"],
  "exclude": ["**/node_modules/**"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "plugins/**/*.test.ts"],
    environment: "node",
  },
});
```

`eslint.config.js`:

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**"] },
  ...tseslint.configs.recommended,
);
```

`.gitignore`:

```
node_modules/
.next/
dist/
coverage/
.turbo/
*.db
*.db-*
.env
.DS_Store
```

`.nvmrc`:

```
22
```

- [ ] **Step 2: Install root dev dependencies**

Run:

```bash
pnpm add -w -D typescript @types/node tsx vitest eslint typescript-eslint
```

Expected: install succeeds and `pnpm-lock.yaml` exists.

- [ ] **Step 3: Verify the toolchain**

Run: `pnpm test && pnpm lint`
Expected: both exit 0. Vitest prints "No test files found, exiting with code 0".

`pnpm typecheck` also exits 0, because `tsconfig.json` includes `vitest.config.ts`.

Version pins found during execution (2026-09-28):
- `typescript@~6.0`: TypeScript 7 is out, but `typescript-eslint` 8.70 supports only `<6.1.0`.
- `@types/node@22`: match the Node version in the spec.
- `packageManager: pnpm@10.34.5`: Corepack 0.34 cannot run pnpm 12. Install with `corepack install -g pnpm@10`.

- [ ] **Step 4: Commit (on `main`)**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo"
```

---

### Task 2: Commit rules and release tooling

**Files:**
- Create: `commitlint.config.js`, `.husky/commit-msg`, `.releaserc.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Install the tools**

```bash
pnpm add -w -D husky @commitlint/cli @commitlint/config-conventional semantic-release @semantic-release/changelog @semantic-release/git
pnpm exec husky init
```

`husky init` adds a `prepare` script and creates `.husky/pre-commit`.

- [ ] **Step 2: Configure commitlint and the hook**

`commitlint.config.js`:

```js
export default { extends: ["@commitlint/config-conventional"] };
```

Delete `.husky/pre-commit`. Create `.husky/commit-msg`:

```sh
pnpm exec commitlint --edit "$1"
```

- [ ] **Step 3: Configure semantic-release**

`.releaserc.json`:

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    [
      "@semantic-release/git",
      {
        "assets": ["CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ],
    "@semantic-release/github"
  ]
}
```

The default commit analyzer gives: `feat` → minor, `fix` → patch, `BREAKING CHANGE` → major.

- [ ] **Step 4: Add the workflows**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches-ignore: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

`.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: write
  issues: write
  pull-requests: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm exec semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`pnpm/action-setup@v4` reads the pnpm version from `packageManager`. Add it to the root `package.json`. Use your local version from `pnpm --version`:

```json
"packageManager": "pnpm@<output of pnpm --version>"
```

- [ ] **Step 5: Check that the hook rejects a bad message**

Run: `git add -A && git commit -m "bad message"`
Expected: FAIL with `subject may not be empty` and `type may not be empty`.

- [ ] **Step 6: Commit, tag `v0.0.0`, and create the work branch**

```bash
git commit -m "chore: add commitlint, husky, and semantic-release"
git tag v0.0.0
git switch -c feat/v0.1
```

Why: semantic-release starts at 1.0.0 when no tag exists. With `v0.0.0` on `main`, the merge of `feat/v0.1` releases `v0.1.0`. All later tasks run on `feat/v0.1`.

---

### Task 3: Core errors, home path, and storage

**Files:**
- Create: `packages/core/package.json`, `packages/core/src/errors.ts`, `packages/core/src/paths.ts`, `packages/core/src/storage.ts`, `packages/core/src/testing.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/storage.test.ts`, `packages/core/src/paths.test.ts`

- [ ] **Step 1: Create the package**

`packages/core/package.json`:

```json
{
  "name": "@eaiku/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing.ts"
  }
}
```

`packages/core/src/testing.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eaiku-test-"));
}
```

- [ ] **Step 2: Write the failing tests**

`packages/core/src/paths.test.ts`:

```ts
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
```

`packages/core/src/storage.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core`
Expected: FAIL with "Failed to resolve import ./paths" and "./storage".

- [ ] **Step 4: Implement**

`packages/core/src/errors.ts`:

```ts
// An expected failure. The CLI prints it as JSON on stderr and exits with code 1,
// so the agent can read the code and details and fix its input.
export class CommandError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
    public readonly code: string = "COMMAND_ERROR",
  ) {
    super(message);
    this.name = "CommandError";
  }
}
```

`packages/core/src/paths.ts`:

```ts
import os from "node:os";
import path from "node:path";

export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.EAIKU_HOME;
  if (value) return path.resolve(value.replace(/^~(?=$|\/)/, os.homedir()));
  return path.join(os.homedir(), "eaiku");
}
```

`packages/core/src/storage.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

export interface Storage {
  root: string;
  path(rel: string): string;
  ensureDir(rel: string): Promise<string>;
  readJson<T>(rel: string): Promise<T | undefined>;
  writeJson(rel: string, data: unknown): Promise<void>;
  writeText(rel: string, text: string): Promise<void>;
  list(rel: string): Promise<string[]>;
  remove(rel: string): Promise<void>;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function createStorage(home: string, pluginId: string): Storage {
  const root = path.join(home, pluginId);

  const resolve = (rel: string): string => {
    const full = path.resolve(root, rel);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error(`Path escapes plugin storage: ${rel}`);
    }
    return full;
  };

  const writeFile = async (rel: string, content: string): Promise<void> => {
    const file = resolve(rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };

  return {
    root,
    path: resolve,
    async ensureDir(rel) {
      const dir = resolve(rel);
      await fs.mkdir(dir, { recursive: true });
      return dir;
    },
    async readJson<T>(rel: string) {
      try {
        return JSON.parse(await fs.readFile(resolve(rel), "utf8")) as T;
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },
    writeJson: (rel, data) => writeFile(rel, JSON.stringify(data, null, 2) + "\n"),
    writeText: (rel, text) => writeFile(rel, text),
    async list(rel) {
      try {
        return (await fs.readdir(resolve(rel))).sort();
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
    },
    async remove(rel) {
      await fs.rm(resolve(rel), { recursive: true, force: true });
    },
  };
}
```

`packages/core/src/index.ts`:

```ts
export * from "./errors";
export * from "./paths";
export * from "./storage";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm install && pnpm vitest run packages/core`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): add home path, per-plugin storage, and CommandError"
```

---

### Task 4: Core database, migrations, and plugin contract

**Files:**
- Create: `packages/core/src/db.ts`, `packages/core/src/plugin.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/db.test.ts`

- [ ] **Step 1: Add better-sqlite3**

```bash
pnpm --filter @eaiku/core add better-sqlite3
pnpm --filter @eaiku/core add -D @types/better-sqlite3
```

Expected: the install builds or downloads the native binary with no "ignored build scripts" warning. If pnpm prints that warning, check `onlyBuiltDependencies` in the root `package.json` and run `pnpm rebuild better-sqlite3`.

- [ ] **Step 2: Write the failing test**

`packages/core/src/db.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb, runMigrations } from "./db";
import { makeTempHome } from "./testing";

function makeMigrationsDir(): string {
  const dir = path.join(makeTempHome(), "migrations");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "0001_init.sql"), "CREATE TABLE demo_items (id TEXT PRIMARY KEY);");
  fs.writeFileSync(path.join(dir, "0002_more.sql"), "ALTER TABLE demo_items ADD COLUMN name TEXT;");
  return dir;
}

describe("runMigrations", () => {
  it("applies each migration once, in file-name order", () => {
    const home = makeTempHome();
    const dir = makeMigrationsDir();
    const db = openDb(home);

    expect(runMigrations(db, "demo", dir)).toEqual(["0001_init.sql", "0002_more.sql"]);
    expect(runMigrations(db, "demo", dir)).toEqual([]);

    db.prepare("INSERT INTO demo_items (id, name) VALUES (?, ?)").run("a", "A");
    expect(db.prepare("SELECT name FROM demo_items").get()).toEqual({ name: "A" });
    db.close();
  });

  it("creates eaiku.db inside the home folder", () => {
    const home = makeTempHome();
    openDb(home).close();
    expect(fs.existsSync(path.join(home, "eaiku.db"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/src/db.test.ts`
Expected: FAIL with "Failed to resolve import ./db".

- [ ] **Step 4: Implement**

`packages/core/src/db.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type Sqlite = Database.Database;

export function openDb(home: string): Sqlite {
  fs.mkdirSync(home, { recursive: true });
  const db = new Database(path.join(home, "eaiku.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// Runs the plugin's *.sql files that did not run yet. Returns the names it applied.
export function runMigrations(db: Sqlite, pluginId: string, migrationsDir: string): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    plugin TEXT NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (plugin, name)
  )`);

  const done = new Set(
    db
      .prepare("SELECT name FROM _migrations WHERE plugin = ?")
      .all(pluginId)
      .map((row) => (row as { name: string }).name),
  );
  const pending = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && !done.has(file))
    .sort();

  const record = db.prepare("INSERT INTO _migrations (plugin, name, applied_at) VALUES (?, ?, ?)");
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(pluginId, file, new Date().toISOString());
    })();
  }
  return pending;
}
```

`packages/core/src/plugin.ts`:

```ts
import { openDb, runMigrations, type Sqlite } from "./db";
import { resolveHome } from "./paths";
import { createStorage, type Storage } from "./storage";

export interface PluginContext {
  home: string;
  storage: Storage;
  db: Sqlite;
}

export type PluginCommand = (args: string[], ctx: PluginContext) => Promise<unknown>;

export type LauncherAction =
  | { label: string; kind: "route"; href: string }
  | { label: string; kind: "copyCommand"; command: string };

export interface HealthCheck {
  label: string;
  run: (ctx: PluginContext) => Promise<{ ok: boolean; hint?: string }>;
}

export interface EaikuPlugin {
  id: string; // storage folder, table prefix, and URL prefix
  name: string;
  description: string;
  version: string;
  icon: string; // lucide icon name
  healthChecks: HealthCheck[];
  launcherActions: LauncherAction[];
  migrationsDir?: string;
  commands?: Record<string, PluginCommand>;
  // `pages` is added in Plan 02 (web app).
}

export function createContext(
  plugin: Pick<EaikuPlugin, "id" | "migrationsDir">,
  home: string = resolveHome(),
): PluginContext {
  const db = openDb(home);
  if (plugin.migrationsDir) runMigrations(db, plugin.id, plugin.migrationsDir);
  return { home, storage: createStorage(home, plugin.id), db };
}
```

`packages/core/src/index.ts`:

```ts
export * from "./db";
export * from "./errors";
export * from "./paths";
export * from "./plugin";
export * from "./storage";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core && pnpm typecheck`
Expected: PASS (7 tests), and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): add SQLite migrations and the plugin contract"
```

---

### Task 5: Catat note schema

**Files:**
- Create: `plugins/catat/package.json`, `plugins/catat/schema/note.ts`, `plugins/catat/lib/transcript.ts` (types only in this task), `plugins/catat/test/fixtures.ts`
- Test: `plugins/catat/schema/note.test.ts`

- [ ] **Step 1: Create the package and add dependencies**

`plugins/catat/package.json`:

```json
{
  "name": "@eaiku/plugin-catat",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./manifest.ts",
    "./schema": "./schema/note.ts"
  },
  "dependencies": {
    "@eaiku/core": "workspace:*"
  }
}
```

```bash
pnpm --filter @eaiku/plugin-catat add zod drizzle-orm youtube-transcript
```

- [ ] **Step 2: Add the transcript types**

`plugins/catat/lib/transcript.ts` (Task 7 adds functions to this file):

```ts
export interface Segment {
  startSec: number;
  durSec: number;
  text: string;
}

export interface Chapter {
  title: string;
  startSec: number;
}

// Stored at <home>/catat/transcripts/<videoId>.json
export interface TranscriptFile {
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  durationSec: number;
  captionLang: string;
  chapters: Chapter[];
  segments: Segment[];
  fetchedAt: string;
}
```

- [ ] **Step 3: Add the shared test fixtures**

`plugins/catat/test/fixtures.ts`:

```ts
import type { Note } from "../schema/note";
import type { Segment, TranscriptFile } from "../lib/transcript";

export const segments: Segment[] = [
  { startSec: 0, durSec: 4, text: "welcome to this short lesson about tokens" },
  { startSec: 4, durSec: 5, text: "a tokenizer splits text into small pieces" },
  { startSec: 9, durSec: 5, text: "each piece is mapped to a number" },
  { startSec: 40, durSec: 5, text: "the model only ever sees those numbers" },
  { startSec: 70, durSec: 6, text: "that is why spelling tasks can be hard" },
];

export const transcript: TranscriptFile = {
  videoId: "abcdefghijk",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  title: "Tokens 101",
  channel: "Demo Channel",
  durationSec: 80,
  captionLang: "en",
  chapters: [],
  segments,
  fetchedAt: "2026-09-28T10:00:00.000Z",
};

const ref = (startSec: number, quote: string) => ({ kind: "timestamp" as const, startSec, quote });

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    schemaVersion: 1,
    id: "2026-09-28-tokens-101",
    createdAt: "2026-09-28T10:00:00.000Z",
    style: "friendly",
    source: {
      type: "youtube",
      url: transcript.url,
      videoId: transcript.videoId,
      title: transcript.title,
      channel: transcript.channel,
      durationSec: 80,
      captionLang: "en",
      range: { startSec: 0, endSec: 80 },
    },
    title: "Tokens 101: how models read text",
    hook: "Your chatbot cannot see letters. Here is why that matters.",
    keyTakeaway: "Models read numbers that stand for pieces of text, not letters.",
    sections: [
      {
        id: "what-a-tokenizer-does",
        heading: "What a tokenizer does",
        body: "A tokenizer cuts text into small pieces.",
        analogy: "Like cutting a pizza into slices before you share it.",
        refs: [ref(4, "A tokenizer splits text")],
      },
      {
        id: "pieces-become-numbers",
        heading: "Pieces become numbers",
        body: "Each piece gets an ID number.",
        refs: [ref(9, "mapped to a number")],
      },
      {
        id: "why-spelling-is-hard",
        heading: "Why spelling is hard",
        body: "The model never sees single letters.",
        refs: [ref(70, "spelling tasks can be hard")],
      },
    ],
    concepts: [
      { term: "Token", definition: "A small piece of text.", refs: [ref(4, "small pieces")] },
      { term: "Tokenizer", definition: "The tool that splits text.", refs: [ref(4, "tokenizer splits")] },
      { term: "Token ID", definition: "The number for a token.", refs: [ref(40, "only ever sees those numbers")] },
    ],
    openQuestions: [
      {
        question: "How is the vocabulary chosen?",
        why: "The video mentions a vocabulary but does not explain how it is built.",
      },
    ],
    tags: ["llm", "tokens"],
    generator: { agent: "claude-code", promptVersion: "catat-v1" },
    ...overrides,
  };
}
```

- [ ] **Step 4: Write the failing test**

`plugins/catat/schema/note.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeNote } from "../test/fixtures";
import { Note } from "./note";

describe("Note schema", () => {
  it("accepts a valid note", () => {
    expect(Note.safeParse(makeNote()).success).toBe(true);
  });

  it("rejects fewer than 3 sections", () => {
    const note = makeNote();
    expect(Note.safeParse({ ...note, sections: note.sections.slice(0, 2) }).success).toBe(false);
  });

  it("rejects a hook longer than 280 characters", () => {
    expect(Note.safeParse(makeNote({ hook: "x".repeat(281) })).success).toBe(false);
  });

  it("rejects a section without refs", () => {
    const note = makeNote();
    const sections = note.sections.map((s, i) => (i === 0 ? { ...s, refs: [] } : s));
    expect(Note.safeParse({ ...note, sections }).success).toBe(false);
  });

  it("rejects an id that is not a kebab-case slug", () => {
    expect(Note.safeParse(makeNote({ id: "Bad Id/../x" })).success).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/schema`
Expected: FAIL with "Failed to resolve import ./note".

- [ ] **Step 6: Implement**

`plugins/catat/schema/note.ts`:

```ts
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a kebab-case slug");

// `quote` holds exact words from the source. `save` checks it against the transcript.
const quote = z.string().max(200).optional();

export const SourceRef = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("timestamp"),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative().optional(),
    quote,
  }),
  z.object({ kind: z.literal("page"), page: z.number().int().positive(), quote }),
  z.object({ kind: z.literal("chapter"), chapter: z.string(), page: z.number().int().optional(), quote }),
]);

export const Source = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("youtube"),
    url: z.string().url(),
    videoId: z.string(),
    title: z.string(),
    channel: z.string().optional(),
    durationSec: z.number().positive(),
    captionLang: z.string(),
    range: z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive() }),
  }),
  z.object({ type: z.literal("pdf"), fileName: z.string(), title: z.string(), pageCount: z.number() }),
  z.object({ type: z.literal("epub"), fileName: z.string(), title: z.string(), author: z.string().optional() }),
]);

export const Section = z.object({
  id: slug,
  heading: z.string().max(80),
  body: z.string().min(1), // Markdown, no raw HTML
  analogy: z.string().optional(),
  refs: z.array(SourceRef).min(1),
});

export const Concept = z.object({
  term: z.string().min(1),
  definition: z.string().max(300),
  refs: z.array(SourceRef).min(1),
});

export const Note = z.object({
  schemaVersion: z.literal(1),
  id: slug,
  createdAt: z.string().datetime(),
  style: z.enum(["friendly", "textbook"]),
  source: Source,
  series: z
    .object({
      id: z.string(),
      part: z.number().int().positive(),
      total: z.number().int().positive(),
      partTitle: z.string(),
    })
    .optional(),
  title: z.string().min(1),
  hook: z.string().max(280),
  keyTakeaway: z.string().max(280),
  sections: z.array(Section).min(3).max(8),
  concepts: z.array(Concept).min(3).max(12),
  openQuestions: z.array(z.object({ question: z.string(), why: z.string() })).max(5),
  tags: z.array(z.string()).max(8),
  generator: z.object({
    agent: z.literal("claude-code"),
    model: z.string().optional(),
    promptVersion: z.string(),
  }),
});

export type Note = z.infer<typeof Note>;
export type SourceRef = z.infer<typeof SourceRef>;
```

Note: the spec shows `quote` added with `.and()`. Here each variant has `quote` directly. The JSON shape is the same, and discriminated unions work better this way.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm install && pnpm vitest run plugins/catat/schema && pnpm typecheck`
Expected: PASS (5 tests), and typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(catat): add the note schema contract"
```

---

### Task 6: Timestamps and video ID parsing

**Files:**
- Create: `plugins/catat/lib/time.ts`, `plugins/catat/lib/video-id.ts`
- Test: `plugins/catat/lib/time.test.ts`, `plugins/catat/lib/video-id.test.ts`

- [ ] **Step 1: Write the failing tests**

`plugins/catat/lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatTimestamp, parseTimestamp } from "./time";

describe("formatTimestamp", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(760)).toBe("12:40");
    expect(formatTimestamp(3723.9)).toBe("1:02:03");
  });
});

describe("parseTimestamp", () => {
  it("parses m:ss, h:mm:ss, and plain seconds", () => {
    expect(parseTimestamp("12:40")).toBe(760);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("760")).toBe(760);
  });

  it("rejects bad input", () => {
    expect(() => parseTimestamp("abc")).toThrow("Invalid timestamp");
    expect(() => parseTimestamp("12:")).toThrow("Invalid timestamp");
  });
});
```

`plugins/catat/lib/video-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseVideoId } from "./video-id";

describe("parseVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["https://youtube.com/watch?v=kCc8FmEb1nY&t=760s", "kCc8FmEb1nY"],
    ["https://m.youtube.com/watch?v=kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["https://youtu.be/kCc8FmEb1nY?si=abc", "kCc8FmEb1nY"],
    ["https://www.youtube.com/shorts/kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["https://www.youtube.com/embed/kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["kCc8FmEb1nY", "kCc8FmEb1nY"],
  ])("reads %s", (input, expected) => {
    expect(parseVideoId(input)).toBe(expected);
  });

  it.each(["https://vimeo.com/123", "https://www.youtube.com/@channel", "not a url"])(
    "rejects %s",
    (input) => {
      expect(() => parseVideoId(input)).toThrow("Not a YouTube video URL");
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run plugins/catat/lib`
Expected: FAIL with "Failed to resolve import ./time" and "./video-id".

- [ ] **Step 3: Implement**

`plugins/catat/lib/time.ts`:

```ts
import { CommandError } from "@eaiku/core";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTimestamp(sec: number): string {
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function parseTimestamp(input: string): number {
  if (/^\d+(\.\d+)?$/.test(input)) return Number(input);
  if (!/^(\d+:)?\d{1,2}:\d{2}$/.test(input)) {
    throw new CommandError(`Invalid timestamp: "${input}". Use m:ss, h:mm:ss, or seconds.`, undefined, "BAD_TIMESTAMP");
  }
  return input.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}
```

`plugins/catat/lib/video-id.ts`:

```ts
import { CommandError } from "@eaiku/core";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoId(input: string): string {
  if (VIDEO_ID.test(input)) return input;

  let id: string | null = null;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") {
      id = url.pathname.split("/")[1] ?? null;
    } else if (host === "youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
    }
  } catch {
    id = null;
  }

  if (!id || !VIDEO_ID.test(id)) {
    throw new CommandError(`Not a YouTube video URL: ${input}`, undefined, "BAD_URL");
  }
  return id;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run plugins/catat/lib`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catat): parse timestamps and YouTube video IDs"
```

---

### Task 7: Transcript segments and sentence grouping

**Files:**
- Modify: `plugins/catat/lib/transcript.ts`
- Test: `plugins/catat/lib/transcript.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/catat/lib/transcript.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeEntities, groupLines, toSegments, toTranscriptText } from "./transcript";

describe("toSegments", () => {
  it("converts milliseconds to seconds and decodes entities", () => {
    expect(toSegments([{ text: "it&amp;#39;s\nhere", duration: 1180, offset: 4220 }])).toEqual([
      { startSec: 4.22, durSec: 1.18, text: "it's here" },
    ]);
  });
});

describe("decodeEntities", () => {
  it("decodes nested and named entities", () => {
    expect(decodeEntities("a &amp;amp; b &quot;c&quot; &lt;d&gt;")).toBe('a & b "c" <d>');
  });
});

describe("groupLines", () => {
  it("ends a line at a sentence end once it is long enough", () => {
    const lines = groupLines(
      [
        { startSec: 0, durSec: 2, text: "Hello there friend." },
        { startSec: 2, durSec: 2, text: "Next one here." },
      ],
      220,
      10,
    );
    expect(lines).toEqual([
      { startSec: 0, endSec: 2, text: "Hello there friend." },
      { startSec: 2, endSec: 4, text: "Next one here." },
    ]);
  });

  it("splits unpunctuated auto-captions at maxChars", () => {
    const a = "a".repeat(30);
    const lines = groupLines(
      [
        { startSec: 0, durSec: 3, text: a },
        { startSec: 3, durSec: 3, text: a },
        { startSec: 6, durSec: 3, text: a },
      ],
      60,
    );
    expect(lines.map((l) => l.startSec)).toEqual([0, 6]);
  });
});

describe("toTranscriptText", () => {
  it("prefixes each line with its timestamp", () => {
    expect(toTranscriptText([{ startSec: 760, endSec: 765, text: "so the tokenizer" }])).toBe(
      "[12:40] so the tokenizer\n",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/lib/transcript.test.ts`
Expected: FAIL with "toSegments is not a function" (or a missing export error).

- [ ] **Step 3: Implement (append to `plugins/catat/lib/transcript.ts`)**

Add this import at the top of the file:

```ts
import { formatTimestamp } from "./time";
```

Append:

```ts
export interface Line {
  startSec: number;
  endSec: number;
  text: string;
}

// Shape returned by the youtube-transcript package (offset and duration in ms).
export interface RawCaption {
  text: string;
  duration: number;
  offset: number;
}

export function decodeEntities(input: string): string {
  let text = input;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/&amp;/g, "&");
  } while (text !== previous);
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function toSegments(raw: RawCaption[]): Segment[] {
  return raw.map((c) => ({
    startSec: c.offset / 1000,
    durSec: c.duration / 1000,
    text: decodeEntities(c.text).replace(/\s+/g, " ").trim(),
  }));
}

// Joins caption fragments into readable lines. A line ends at a sentence end
// once it has minChars, or at maxChars (auto-captions have no punctuation).
export function groupLines(segments: Segment[], maxChars = 220, minChars = 80): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const endSec = seg.startSec + seg.durSec;
    if (current) {
      current.text += " " + text;
      current.endSec = endSec;
    } else {
      current = { startSec: seg.startSec, endSec, text };
    }

    const endsSentence = /[.?!]["')\]]?$/.test(current.text);
    if ((endsSentence && current.text.length >= minChars) || current.text.length >= maxChars) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function toTranscriptText(lines: Line[]): string {
  return lines.map((l) => `[${formatTimestamp(l.startSec)}] ${l.text}`).join("\n") + "\n";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run plugins/catat/lib/transcript.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catat): convert captions to segments and readable lines"
```

---

### Task 8: YouTube access (chapters, oEmbed, captions) and Day 1 checks

**Files:**
- Create: `plugins/catat/lib/chapters.ts`, `plugins/catat/lib/youtube.ts`, `plugins/catat/scripts/smoke.ts`
- Test: `plugins/catat/lib/chapters.test.ts`

`youtube.ts` is the **only** file that talks to YouTube or imports `youtube-transcript`. If YouTube breaks the package, only this file changes.

- [ ] **Step 1: Write the failing test for the pure chapter parser**

`plugins/catat/lib/chapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseChapters } from "./chapters";

const html = [
  '..."chapterRenderer":{"title":{"simpleText":"Intro"},"timeRangeStartMillis":0,...',
  '..."chapterRenderer":{"title":{"simpleText":"Tokenization \\u0026 BPE"},"timeRangeStartMillis":760000,...',
  // YouTube repeats chapter data in the page. Duplicates must be removed.
  '..."chapterRenderer":{"title":{"simpleText":"Intro"},"timeRangeStartMillis":0,...',
].join("");

describe("parseChapters", () => {
  it("reads chapter titles and start times, without duplicates", () => {
    expect(parseChapters(html)).toEqual([
      { title: "Intro", startSec: 0 },
      { title: "Tokenization & BPE", startSec: 760 },
    ]);
  });

  it("returns [] when the page has no chapters", () => {
    expect(parseChapters("<html></html>")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/lib/chapters.test.ts`
Expected: FAIL with "Failed to resolve import ./chapters".

- [ ] **Step 3: Implement the parser**

`plugins/catat/lib/chapters.ts`:

```ts
import type { Chapter } from "./transcript";

const CHAPTER =
  /"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeRangeStartMillis":(\d+)/g;

// Best effort: YouTube does not document this page data. Returns [] when not found.
export function parseChapters(html: string): Chapter[] {
  const seen = new Set<number>();
  const chapters: Chapter[] = [];
  for (const match of html.matchAll(CHAPTER)) {
    const startSec = Number(match[2]) / 1000;
    if (seen.has(startSec)) continue;
    seen.add(startSec);
    chapters.push({ title: JSON.parse(`"${match[1]}"`) as string, startSec });
  }
  return chapters.sort((a, b) => a.startSec - b.startSec);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run plugins/catat/lib/chapters.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the network wrapper**

`plugins/catat/lib/youtube.ts`:

```ts
import { CommandError } from "@eaiku/core";
import { YoutubeTranscript } from "youtube-transcript";
import { parseChapters } from "./chapters";
import { toSegments, type Chapter, type Segment } from "./transcript";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
  "Accept-Language": "en",
};

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Maps youtube-transcript error class names to stable codes for the agent.
const ERROR_CODES: Record<string, string> = {
  YoutubeTranscriptNotAvailableLanguageError: "NO_ENGLISH_CAPTIONS",
  YoutubeTranscriptDisabledError: "NO_CAPTIONS",
  YoutubeTranscriptNotAvailableError: "NO_CAPTIONS",
  YoutubeTranscriptVideoUnavailableError: "VIDEO_UNAVAILABLE",
  YoutubeTranscriptTooManyRequestError: "BLOCKED",
};

export async function fetchCaptions(videoId: string, lang = "en"): Promise<Segment[]> {
  let raw;
  try {
    // Always pass lang: without it, the package can return another language (seen: Arabic).
    raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
  } catch (error) {
    const name = (error as Error)?.constructor?.name ?? "Error";
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message, { cause: name }, ERROR_CODES[name] ?? "FETCH_FAILED");
  }
  if (raw.length === 0) {
    throw new CommandError(
      "YouTube returned an empty transcript. YouTube may be blocking this request.",
      undefined,
      "EMPTY_TRANSCRIPT",
    );
  }
  return toSegments(raw);
}

export async function fetchOEmbed(videoId: string): Promise<{ title: string; channel?: string }> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(videoId))}`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { title: `YouTube video ${videoId}` };
    const data = (await res.json()) as { title?: string; author_name?: string };
    return { title: data.title ?? `YouTube video ${videoId}`, channel: data.author_name };
  } catch {
    return { title: `YouTube video ${videoId}` };
  }
}

export async function fetchChapters(videoId: string): Promise<Chapter[]> {
  try {
    const res = await fetch(watchUrl(videoId), {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    return parseChapters(await res.text());
  } catch {
    return [];
  }
}
```

- [ ] **Step 6: Add the Day 1 smoke script**

`plugins/catat/scripts/smoke.ts`:

```ts
// Live check against YouTube. Run by hand; not part of `pnpm test`.
import { fetchCaptions, fetchChapters, fetchOEmbed } from "../lib/youtube";

const VIDEO_IDS = [
  "aircAruvnKk", // 3Blue1Brown, many caption languages
  "wjZofJX0v4M", // 3Blue1Brown
  "kCc8FmEb1nY", // Karpathy, ~2h
  "zjkBMFhNj_g", // Karpathy, ~1h
  "zduSFxRajkE", // Karpathy, tokenizer
  "7xTGNNLPyMI", // Karpathy, ~3.5h
  "8jPQjjsBbIc", // TED talk
  "arj7oStGLkU", // TED talk
  "UF8uR6Z6KLc", // Stanford speech
  "dQw4w9WgXcQ", // music video
];

for (const id of VIDEO_IDS) {
  const [meta, chapters, captions] = await Promise.allSettled([
    fetchOEmbed(id),
    fetchChapters(id),
    fetchCaptions(id),
  ]);
  console.log(
    id.padEnd(12),
    meta.status === "fulfilled" ? meta.value.title.slice(0, 40).padEnd(40) : "oEmbed FAILED".padEnd(40),
    chapters.status === "fulfilled" ? `chapters=${chapters.value.length}`.padEnd(12) : "chapters=ERR",
    captions.status === "fulfilled"
      ? `segments=${captions.value.length} first="${captions.value[0]?.text.slice(0, 30)}"`
      : `captions ERROR ${(captions.reason as Error).message.slice(0, 80)}`,
  );
}
```

- [ ] **Step 7: Run the Day 1 checks**

Run: `pnpm tsx plugins/catat/scripts/smoke.ts`

Expected:
- A real title for every video (oEmbed works with no API key).
- `segments=` and English text for most videos.
- `chapters=` greater than 0 for at least some of the Karpathy videos.

Record the result in spec section 15 ("Day 1 checks"). **If most captions fail,** stop and tell the user before you continue. The plan depends on this package.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(catat): fetch captions, oEmbed metadata, and chapters from YouTube"
```

---

### Task 9: Snap cut points and build parts

**Files:**
- Create: `plugins/catat/lib/snap.ts`
- Test: `plugins/catat/lib/snap.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/catat/lib/snap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Segment } from "./transcript";
import { buildParts, snapCut } from "./snap";

// Pauses before each segment: B=2s, C=8s, D=1s.
const segments: Segment[] = [
  { startSec: 0, durSec: 10, text: "a" },
  { startSec: 12, durSec: 10, text: "b" },
  { startSec: 30, durSec: 5, text: "c" },
  { startSec: 36, durSec: 5, text: "d" },
];

describe("snapCut", () => {
  it("moves the cut to the start of the segment after the longest pause", () => {
    expect(snapCut(segments, 25, 120)).toBe(30);
  });

  it("only looks inside the window", () => {
    expect(snapCut(segments, 13, 2)).toBe(12);
  });

  it("keeps the cut when no segment starts inside the window", () => {
    expect(snapCut(segments, 100, 5)).toBe(100);
  });
});

describe("buildParts", () => {
  it("turns cuts into ordered parts that cover the whole video", () => {
    expect(buildParts([60, 30, 30, 0, 150], 100)).toEqual([
      { part: 1, startSec: 0, endSec: 30 },
      { part: 2, startSec: 30, endSec: 60 },
      { part: 3, startSec: 60, endSec: 100 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/lib/snap.test.ts`
Expected: FAIL with "Failed to resolve import ./snap".

- [ ] **Step 3: Implement**

`plugins/catat/lib/snap.ts`:

```ts
import type { Segment } from "./transcript";

export interface Part {
  part: number;
  startSec: number;
  endSec: number;
  title?: string;
}

// Moves a cut to the segment start with the longest pause before it, within ±windowSec.
// Ties go to the start closest to the original cut.
export function snapCut(segments: Segment[], cutSec: number, windowSec = 120): number {
  let best = cutSec;
  let bestGap = -Infinity;
  let bestDistance = Infinity;

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const start = segments[i].startSec;
    const distance = Math.abs(start - cutSec);
    if (distance > windowSec) continue;
    const gap = start - (prev.startSec + prev.durSec);
    if (gap > bestGap || (gap === bestGap && distance < bestDistance)) {
      best = start;
      bestGap = gap;
      bestDistance = distance;
    }
  }
  return best;
}

export function buildParts(cuts: number[], durationSec: number): Part[] {
  const points = [...new Set(cuts.filter((c) => c > 0 && c < durationSec))].sort((a, b) => a - b);
  const edges = [0, ...points, durationSec];
  return edges.slice(0, -1).map((startSec, i) => ({ part: i + 1, startSec, endSec: edges[i + 1] }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run plugins/catat/lib/snap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catat): snap cut points to pauses and build parts"
```

---

### Task 10: Citation checks

**Files:**
- Create: `plugins/catat/lib/citations.ts`
- Test: `plugins/catat/lib/citations.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/catat/lib/citations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeNote, transcript } from "../test/fixtures";
import { checkCitations } from "./citations";

describe("checkCitations", () => {
  it("passes a note whose refs are in range and whose quotes exist", () => {
    expect(checkCitations(makeNote(), transcript)).toEqual([]);
  });

  it("ignores case and punctuation in quotes", () => {
    const note = makeNote();
    note.sections[0].refs = [{ kind: "timestamp", startSec: 4, quote: "A TOKENIZER, splits... text!" }];
    expect(checkCitations(note, transcript)).toEqual([]);
  });

  it("reports a quote that is not near its timestamp", () => {
    const note = makeNote();
    note.sections[0].refs = [{ kind: "timestamp", startSec: 70, quote: "a tokenizer splits text" }];
    expect(checkCitations(note, transcript)).toEqual([
      { path: "sections[0].refs[0]", message: expect.stringContaining("not found in the transcript near 1:10") },
    ]);
  });

  it("reports a timestamp outside the note range", () => {
    const base = makeNote();
    if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
    const note = makeNote({ source: { ...base.source, range: { startSec: 0, endSec: 30 } } });
    const errors = checkCitations(note, transcript);
    expect(errors.map((e) => e.path)).toEqual(["sections[2].refs[0]", "concepts[2].refs[0]"]);
    expect(errors[0].message).toContain("outside the note range 0:00–0:30");
  });

  it("reports a range longer than the video", () => {
    const base = makeNote();
    if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
    const note = makeNote({ source: { ...base.source, range: { startSec: 0, endSec: 500 } } });
    expect(checkCitations(note, transcript)[0]).toEqual({
      path: "source.range",
      message: expect.stringContaining("must be inside the video"),
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/lib/citations.test.ts`
Expected: FAIL with "Failed to resolve import ./citations".

- [ ] **Step 3: Implement**

`plugins/catat/lib/citations.ts`:

```ts
import type { Note, SourceRef } from "../schema/note";
import { formatTimestamp } from "./time";
import type { TranscriptFile } from "./transcript";

export interface CitationError {
  path: string;
  message: string;
}

const QUOTE_TOLERANCE_SEC = 30;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function allRefs(note: Note): { path: string; ref: SourceRef }[] {
  return [
    ...note.sections.flatMap((s, i) => s.refs.map((ref, j) => ({ path: `sections[${i}].refs[${j}]`, ref }))),
    ...note.concepts.flatMap((c, i) => c.refs.map((ref, j) => ({ path: `concepts[${i}].refs[${j}]`, ref }))),
  ];
}

export function checkCitations(
  note: Note,
  transcript: Pick<TranscriptFile, "durationSec" | "segments">,
): CitationError[] {
  if (note.source.type !== "youtube") {
    return [{ path: "source.type", message: "v0.1 supports YouTube notes only." }];
  }
  const { range } = note.source;
  const errors: CitationError[] = [];

  if (range.startSec >= range.endSec || range.endSec > transcript.durationSec + 1) {
    errors.push({
      path: "source.range",
      message: `Range ${formatTimestamp(range.startSec)}–${formatTimestamp(range.endSec)} must be inside the video (0:00–${formatTimestamp(transcript.durationSec)}) and start before it ends.`,
    });
    return errors;
  }

  const rangeLabel = `${formatTimestamp(range.startSec)}–${formatTimestamp(range.endSec)}`;

  for (const { path, ref } of allRefs(note)) {
    if (ref.kind !== "timestamp") {
      errors.push({ path, message: `YouTube notes must use "timestamp" refs, not "${ref.kind}".` });
      continue;
    }
    const outside = (sec: number) => sec < range.startSec || sec > range.endSec;
    if (outside(ref.startSec) || (ref.endSec !== undefined && (outside(ref.endSec) || ref.endSec < ref.startSec))) {
      errors.push({ path, message: `Timestamp ${formatTimestamp(ref.startSec)} is outside the note range ${rangeLabel}.` });
      continue;
    }
    if (ref.quote === undefined) continue;

    const wanted = normalize(ref.quote);
    const nearby = transcript.segments
      .filter(
        (s) =>
          s.startSec + s.durSec >= ref.startSec - QUOTE_TOLERANCE_SEC &&
          s.startSec <= ref.startSec + QUOTE_TOLERANCE_SEC,
      )
      .map((s) => s.text)
      .join(" ");
    if (!wanted || !normalize(nearby).includes(wanted)) {
      errors.push({
        path,
        message: `Quote "${ref.quote}" not found in the transcript near ${formatTimestamp(ref.startSec)} (±${QUOTE_TOLERANCE_SEC}s). Copy the exact words from the transcript.`,
      });
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run plugins/catat/lib/citations.test.ts && pnpm typecheck`
Expected: PASS (5 tests), and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catat): verify note citations against the transcript"
```

---

### Task 11: Catat SQLite tables and index

**Files:**
- Create: `plugins/catat/db/migrations/0001_init.sql`, `plugins/catat/db/tables.ts`, `plugins/catat/db/index.ts`
- Test: `plugins/catat/db/index.test.ts`

- [ ] **Step 1: Write the migration**

`plugins/catat/db/migrations/0001_init.sql`:

```sql
CREATE TABLE catat_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  video_id TEXT NOT NULL,
  channel TEXT,
  style TEXT NOT NULL,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  series_id TEXT,
  part INTEGER,
  total INTEGER,
  hook TEXT NOT NULL,
  key_takeaway TEXT NOT NULL,
  created_at TEXT NOT NULL,
  path TEXT NOT NULL
);

CREATE INDEX catat_notes_series_idx ON catat_notes (series_id, part);

CREATE TABLE catat_note_tags (
  note_id TEXT NOT NULL REFERENCES catat_notes (id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE VIRTUAL TABLE catat_notes_fts USING fts5 (
  note_id UNINDEXED,
  title,
  hook,
  key_takeaway,
  sections_text,
  concepts_text
);
```

- [ ] **Step 2: Write the failing test**

`plugins/catat/db/index.test.ts`:

```ts
import { createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { makeNote } from "../test/fixtures";
import { clearIndex, getSeriesParts, indexNote, MIGRATIONS_DIR } from "./index";

function setup() {
  return createContext({ id: "catat", migrationsDir: MIGRATIONS_DIR }, makeTempHome());
}

describe("indexNote", () => {
  it("writes the note row, tags, and full-text row", () => {
    const { db } = setup();
    indexNote(db, makeNote(), "/x/note.json");

    expect(db.prepare("SELECT id, video_id, start_sec, end_sec FROM catat_notes").all()).toEqual([
      { id: "2026-09-28-tokens-101", video_id: "abcdefghijk", start_sec: 0, end_sec: 80 },
    ]);
    expect(db.prepare("SELECT tag FROM catat_note_tags ORDER BY tag").all()).toEqual([
      { tag: "llm" },
      { tag: "tokens" },
    ]);
    expect(
      db.prepare("SELECT note_id FROM catat_notes_fts WHERE catat_notes_fts MATCH ?").all("pizza"),
    ).toEqual([{ note_id: "2026-09-28-tokens-101" }]);
  });

  it("replaces old rows when the same note is indexed again", () => {
    const { db } = setup();
    indexNote(db, makeNote(), "/x/note.json");
    indexNote(db, makeNote({ tags: ["new"] }), "/x/note.json");

    expect(db.prepare("SELECT count(*) AS n FROM catat_notes").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT tag FROM catat_note_tags").all()).toEqual([{ tag: "new" }]);
    expect(db.prepare("SELECT count(*) AS n FROM catat_notes_fts").get()).toEqual({ n: 1 });
  });

  it("getSeriesParts returns the saved parts of a series, without the excluded note", () => {
    const { db } = setup();
    const base = makeNote();
    if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
    const part = (n: number, startSec: number, endSec: number) =>
      makeNote({
        id: `tokens-p${n}`,
        source: { ...base.source, range: { startSec, endSec } },
        series: { id: "abcdefghijk", part: n, total: 3, partTitle: `Part ${n}` },
      });
    indexNote(db, part(2, 30, 60), "/x/2.json");
    indexNote(db, part(1, 0, 30), "/x/1.json");

    expect(getSeriesParts(db, "abcdefghijk")).toEqual([
      { id: "tokens-p1", part: 1, startSec: 0, endSec: 30 },
      { id: "tokens-p2", part: 2, startSec: 30, endSec: 60 },
    ]);
    expect(getSeriesParts(db, "abcdefghijk", "tokens-p2")).toEqual([
      { id: "tokens-p1", part: 1, startSec: 0, endSec: 30 },
    ]);
  });

  it("clearIndex empties all catat tables", () => {
    const { db } = setup();
    indexNote(db, makeNote(), "/x/note.json");
    clearIndex(db);
    expect(db.prepare("SELECT count(*) AS n FROM catat_notes").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM catat_notes_fts").get()).toEqual({ n: 0 });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/db`
Expected: FAIL with "Failed to resolve import ./index".

- [ ] **Step 4: Implement**

`plugins/catat/db/tables.ts`:

```ts
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Must match db/migrations. The FTS table is queried with raw SQL (Drizzle has no FTS5 support).
export const catatNotes = sqliteTable("catat_notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  videoId: text("video_id").notNull(),
  channel: text("channel"),
  style: text("style").notNull(),
  startSec: real("start_sec").notNull(),
  endSec: real("end_sec").notNull(),
  seriesId: text("series_id"),
  part: integer("part"),
  total: integer("total"),
  hook: text("hook").notNull(),
  keyTakeaway: text("key_takeaway").notNull(),
  createdAt: text("created_at").notNull(),
  path: text("path").notNull(),
});

export const catatNoteTags = sqliteTable(
  "catat_note_tags",
  {
    noteId: text("note_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tag] })],
);
```

`plugins/catat/db/index.ts`:

```ts
import { fileURLToPath } from "node:url";
import type { Sqlite } from "@eaiku/core";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Note } from "../schema/note";
import { catatNotes, catatNoteTags } from "./tables";

export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

export function indexNote(sqlite: Sqlite, note: Note, notePath: string): void {
  if (note.source.type !== "youtube") throw new Error("v0.1 indexes YouTube notes only.");
  const db = drizzle(sqlite);
  const row = {
    id: note.id,
    title: note.title,
    videoId: note.source.videoId,
    channel: note.source.channel ?? null,
    style: note.style,
    startSec: note.source.range.startSec,
    endSec: note.source.range.endSec,
    seriesId: note.series?.id ?? null,
    part: note.series?.part ?? null,
    total: note.series?.total ?? null,
    hook: note.hook,
    keyTakeaway: note.keyTakeaway,
    createdAt: note.createdAt,
    path: notePath,
  };
  const sectionsText = note.sections.map((s) => [s.heading, s.body, s.analogy ?? ""].join("\n")).join("\n\n");
  const conceptsText = note.concepts.map((c) => `${c.term}: ${c.definition}`).join("\n");
  const tags = [...new Set(note.tags)];

  sqlite.transaction(() => {
    db.insert(catatNotes).values(row).onConflictDoUpdate({ target: catatNotes.id, set: row }).run();
    db.delete(catatNoteTags).where(eq(catatNoteTags.noteId, note.id)).run();
    if (tags.length > 0) db.insert(catatNoteTags).values(tags.map((tag) => ({ noteId: note.id, tag }))).run();
    sqlite.prepare("DELETE FROM catat_notes_fts WHERE note_id = ?").run(note.id);
    sqlite
      .prepare(
        "INSERT INTO catat_notes_fts (note_id, title, hook, key_takeaway, sections_text, concepts_text) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(note.id, note.title, note.hook, note.keyTakeaway, sectionsText, conceptsText);
  })();
}

export function clearIndex(sqlite: Sqlite): void {
  sqlite.exec("DELETE FROM catat_note_tags; DELETE FROM catat_notes; DELETE FROM catat_notes_fts;");
}

export interface SavedPart {
  id: string;
  part: number;
  startSec: number;
  endSec: number;
}

// Saved parts of one video, in part order. `plan` uses them so the next part starts where
// the saved part really ended (no overlap from the 5-minute buffer).
export function getSeriesParts(sqlite: Sqlite, seriesId: string, excludeNoteId?: string): SavedPart[] {
  const rows = sqlite
    .prepare(
      "SELECT id, part, start_sec AS startSec, end_sec AS endSec FROM catat_notes WHERE series_id = ? AND part IS NOT NULL ORDER BY part",
    )
    .all(seriesId) as SavedPart[];
  return rows.filter((row) => row.id !== excludeNoteId);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run plugins/catat/db && pnpm typecheck`
Expected: PASS (4 tests), and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(catat): index notes in SQLite with full-text search"
```

---

### Task 12: Plan logic and the `fetch`, `plan`, and `read` commands

**Files:**
- Create: `plugins/catat/lib/plan.ts`, `plugins/catat/cli/shared.ts`, `plugins/catat/cli/fetch.ts`, `plugins/catat/cli/plan.ts`, `plugins/catat/cli/read.ts`
- Modify: `plugins/catat/test/fixtures.ts`
- Test: `plugins/catat/lib/plan.test.ts`, `plugins/catat/cli/plan.test.ts`, `plugins/catat/cli/read.test.ts`

The plan has three modes (spec §7, step 2):
- `single`: the video is 10 minutes or shorter. One note.
- `chapters`: longer, with 2 or more chapters. One part per chapter, no buffer.
- `grid`: longer, no chapters. A cut every 10 minutes, snapped to a pause (±2 min). Each part may run up to 5 minutes past its planned end (`readUntilSec`). A saved part keeps its saved range, and the next part starts at its saved end.

`fetch` has no unit test because it only joins tested pieces with network calls. Task 17 checks it live.

- [ ] **Step 1: Add a long transcript fixture**

Append to `plugins/catat/test/fixtures.ts`:

```ts
// 29:59 of 4-second segments every 5 seconds (1-second pauses), with two longer pauses:
// 4 seconds before 10:10 and 3 seconds before 19:55. No chapters.
export function makeLongTranscript(): TranscriptFile {
  const long: Segment[] = [];
  for (let t = 0; t < 1800; t += 5) {
    long.push({ startSec: t, durSec: t === 605 ? 1 : t === 1190 ? 2 : 4, text: `line at ${t}` });
  }
  return { ...transcript, durationSec: 1799, chapters: [], segments: long };
}
```

- [ ] **Step 2: Write the failing test for the plan logic**

`plugins/catat/lib/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeLongTranscript, makeNote, transcript } from "../test/fixtures";
import { checkSeriesRange, computePlan } from "./plan";

describe("computePlan", () => {
  it("makes one part for a video of 10 minutes or less", () => {
    expect(computePlan(transcript)).toEqual({
      mode: "single",
      total: 1,
      parts: [{ part: 1, startSec: 0, endSec: 80, readUntilSec: 80 }],
    });
  });

  it("uses chapters, with no buffer", () => {
    const plan = computePlan({
      ...makeLongTranscript(),
      chapters: [
        { title: "Intro", startSec: 0 },
        { title: "Middle", startSec: 900 },
      ],
    });
    expect(plan).toEqual({
      mode: "chapters",
      total: 2,
      parts: [
        { part: 1, startSec: 0, endSec: 900, readUntilSec: 900, title: "Intro" },
        { part: 2, startSec: 900, endSec: 1799, readUntilSec: 1799, title: "Middle" },
      ],
    });
  });

  it("cuts every 10 minutes at the nearest long pause and adds a 5-minute buffer", () => {
    expect(computePlan(makeLongTranscript())).toEqual({
      mode: "grid",
      total: 3,
      parts: [
        { part: 1, startSec: 0, endSec: 610, readUntilSec: 910 },
        { part: 2, startSec: 610, endSec: 1195, readUntilSec: 1495 },
        { part: 3, startSec: 1195, endSec: 1799, readUntilSec: 1799 },
      ],
    });
  });

  it("starts the next part where the saved part really ended", () => {
    const plan = computePlan(makeLongTranscript(), [{ id: "p1", part: 1, startSec: 0, endSec: 820 }]);
    expect(plan.parts.slice(0, 2)).toEqual([
      { part: 1, startSec: 0, endSec: 820, readUntilSec: 820, savedNoteId: "p1" },
      { part: 2, startSec: 820, endSec: 1195, readUntilSec: 1495 },
    ]);
  });
});

describe("checkSeriesRange", () => {
  const plan = computePlan(makeLongTranscript());
  const base = makeNote();
  if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
  const partNote = (startSec: number, endSec: number, part = 1, total = 3) =>
    makeNote({
      source: { ...base.source, durationSec: 1799, range: { startSec, endSec } },
      series: { id: "abcdefghijk", part, total, partTitle: "Intro" },
    });

  it("accepts a part that ends inside the buffer", () => {
    expect(checkSeriesRange(partNote(0, 820), plan)).toBeNull();
  });

  it("rejects a part that ends after the buffer", () => {
    expect(checkSeriesRange(partNote(0, 1000), plan)).toContain("must end at or before 15:10");
  });

  it("rejects a part with the wrong start", () => {
    expect(checkSeriesRange(partNote(600, 900, 2), plan)).toContain("must start at 10:10");
  });

  it("rejects a wrong total", () => {
    expect(checkSeriesRange(partNote(0, 820, 1, 5), plan)).toContain("series.total must be 3");
  });

  it("ignores notes without a series", () => {
    expect(checkSeriesRange(makeNote(), plan)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/lib/plan.test.ts`
Expected: FAIL with "Cannot find module './plan'".

- [ ] **Step 4: Implement the plan logic**

`plugins/catat/lib/plan.ts`:

```ts
import type { SavedPart } from "../db";
import type { Note } from "../schema/note";
import { buildParts, snapCut, type Part } from "./snap";
import { formatTimestamp } from "./time";
import type { TranscriptFile } from "./transcript";

export const SINGLE_MAX_SEC = 600;
export const GRID_SEC = 600;
export const BUFFER_SEC = 300;
export const SNAP_WINDOW_SEC = 120;

export interface PlannedPart {
  part: number;
  startSec: number;
  endSec: number; // planned end
  readUntilSec: number; // planned end + buffer; the note may end anywhere up to here
  title?: string;
  savedNoteId?: string;
}

export interface Plan {
  mode: "single" | "chapters" | "grid";
  total: number;
  parts: PlannedPart[];
}

type PlanInput = Pick<TranscriptFile, "durationSec" | "segments" | "chapters">;

function baseParts(t: PlanInput): { mode: Plan["mode"]; bufferSec: number; parts: Part[] } {
  if (t.durationSec <= SINGLE_MAX_SEC) {
    return { mode: "single", bufferSec: 0, parts: [{ part: 1, startSec: 0, endSec: t.durationSec }] };
  }
  if (t.chapters.length >= 2) {
    const parts = buildParts(
      t.chapters.map((c) => c.startSec),
      t.durationSec,
    ).map((p) => ({ ...p, title: t.chapters.find((c) => c.startSec === p.startSec)?.title }));
    return { mode: "chapters", bufferSec: 0, parts };
  }
  // Stop half a grid step before the end, so the last part is never shorter than 5 minutes.
  const cuts: number[] = [];
  for (let c = GRID_SEC; c < t.durationSec - GRID_SEC / 2; c += GRID_SEC) {
    cuts.push(snapCut(t.segments, c, SNAP_WINDOW_SEC));
  }
  return { mode: "grid", bufferSec: BUFFER_SEC, parts: buildParts(cuts, t.durationSec) };
}

export function computePlan(t: PlanInput, saved: SavedPart[] = []): Plan {
  const { mode, bufferSec, parts } = baseParts(t);
  const savedByPart = new Map(saved.map((s) => [s.part, s]));

  let previousEnd = 0;
  const planned = parts.map((p): PlannedPart => {
    const s = savedByPart.get(p.part);
    if (s) {
      previousEnd = s.endSec;
      return { ...p, startSec: s.startSec, endSec: s.endSec, readUntilSec: s.endSec, savedNoteId: s.id };
    }
    // A saved previous part may have used its buffer. Start where it really ended.
    const startSec = previousEnd > p.startSec && previousEnd < p.endSec ? previousEnd : p.startSec;
    previousEnd = p.endSec;
    return { ...p, startSec, readUntilSec: Math.min(p.endSec + bufferSec, t.durationSec) };
  });
  return { mode, total: planned.length, parts: planned };
}

// Returns a message when a series note does not match the plan, or null when it does.
export function checkSeriesRange(note: Note, plan: Plan): string | null {
  if (!note.series || note.source.type !== "youtube") return null;
  const { series } = note;
  const { range, videoId } = note.source;

  if (series.id !== videoId) return `series.id must be the videoId "${videoId}".`;
  if (series.total !== plan.total) return `series.total must be ${plan.total}.`;
  const part = plan.parts.find((p) => p.part === series.part);
  if (!part) return `Part ${series.part} does not exist. The plan has ${plan.total} parts.`;
  if (Math.abs(range.startSec - part.startSec) > 1) {
    return `Part ${series.part} must start at ${formatTimestamp(part.startSec)} (${part.startSec}s).`;
  }
  if (range.endSec > part.readUntilSec + 1) {
    return `Part ${series.part} must end at or before ${formatTimestamp(part.readUntilSec)} (${part.readUntilSec}s).`;
  }
  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run plugins/catat/lib/plan.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Write the failing tests for the commands**

`plugins/catat/cli/plan.test.ts`:

```ts
import { CommandError, createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { indexNote, MIGRATIONS_DIR } from "../db";
import { makeLongTranscript, makeNote } from "../test/fixtures";
import { planCommand } from "./plan";

function setup() {
  return createContext({ id: "catat", migrationsDir: MIGRATIONS_DIR }, makeTempHome());
}

describe("planCommand", () => {
  it("returns a labelled plan whose next part starts after the saved part", async () => {
    const ctx = setup();
    const long = makeLongTranscript();
    await ctx.storage.writeJson(`transcripts/${long.videoId}.json`, long);
    const base = makeNote();
    if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
    indexNote(
      ctx.db,
      makeNote({
        id: "tokens-p1",
        source: { ...base.source, durationSec: 1799, range: { startSec: 0, endSec: 820 } },
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
```

`plugins/catat/cli/read.test.ts`:

```ts
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
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm vitest run plugins/catat/cli`
Expected: FAIL with "Cannot find module './plan'" and "./read".

- [ ] **Step 8: Implement the shared helper**

`plugins/catat/cli/shared.ts`:

```ts
import { CommandError, type PluginContext } from "@eaiku/core";
import type { TranscriptFile } from "../lib/transcript";
import { parseVideoId } from "../lib/video-id";

export async function loadTranscript(ctx: PluginContext, videoIdOrUrl: string): Promise<TranscriptFile> {
  const videoId = parseVideoId(videoIdOrUrl);
  const transcript = await ctx.storage.readJson<TranscriptFile>(`transcripts/${videoId}.json`);
  if (!transcript) {
    throw new CommandError(
      `No transcript for ${videoId}. Run "eaiku catat fetch <url>" first.`,
      undefined,
      "NOT_FETCHED",
    );
  }
  return transcript;
}
```

- [ ] **Step 9: Implement `plan` and `read`**

`plugins/catat/cli/plan.ts`:

```ts
import { CommandError, type PluginCommand } from "@eaiku/core";
import { getSeriesParts } from "../db";
import { computePlan } from "../lib/plan";
import { formatTimestamp } from "../lib/time";
import { loadTranscript } from "./shared";

export const planCommand: PluginCommand = async (args, ctx) => {
  const input = args[0];
  if (!input) throw new CommandError("Usage: eaiku catat plan <videoId>", undefined, "USAGE");
  const transcript = await loadTranscript(ctx, input);
  const plan = computePlan(transcript, getSeriesParts(ctx.db, transcript.videoId));

  return {
    videoId: transcript.videoId,
    title: transcript.title,
    durationLabel: formatTimestamp(transcript.durationSec),
    mode: plan.mode,
    total: plan.total,
    parts: plan.parts.map((p) => ({
      ...p,
      startLabel: formatTimestamp(p.startSec),
      endLabel: formatTimestamp(p.endSec),
      readUntilLabel: formatTimestamp(p.readUntilSec),
    })),
  };
};
```

`plugins/catat/cli/read.ts`:

```ts
import { parseArgs } from "node:util";
import { CommandError, type PluginCommand } from "@eaiku/core";
import { formatTimestamp, parseTimestamp } from "../lib/time";
import { groupLines, toTranscriptText } from "../lib/transcript";
import { loadTranscript } from "./shared";

// Returns only the transcript lines of one range, so the agent never loads a whole long video.
export const readCommand: PluginCommand = async (args, ctx) => {
  const { values, positionals } = parseArgs({
    args,
    options: { from: { type: "string" }, to: { type: "string" } },
    allowPositionals: true,
  });
  const input = positionals[0];
  if (!input) {
    throw new CommandError("Usage: eaiku catat read <videoId> [--from m:ss] [--to m:ss]", undefined, "USAGE");
  }
  const transcript = await loadTranscript(ctx, input);
  const fromSec = values.from ? parseTimestamp(values.from) : 0;
  const toSec = values.to ? parseTimestamp(values.to) : transcript.durationSec;
  const segments = transcript.segments.filter((s) => s.startSec >= fromSec && s.startSec < toSec);

  return {
    videoId: transcript.videoId,
    from: formatTimestamp(fromSec),
    to: formatTimestamp(toSec),
    text: toTranscriptText(groupLines(segments)),
  };
};
```

- [ ] **Step 10: Implement `fetch`**

`plugins/catat/cli/fetch.ts`:

```ts
import { CommandError, type PluginCommand } from "@eaiku/core";
import { formatTimestamp } from "../lib/time";
import { groupLines, toTranscriptText, type TranscriptFile } from "../lib/transcript";
import { parseVideoId } from "../lib/video-id";
import { fetchCaptions, fetchChapters, fetchOEmbed, watchUrl } from "../lib/youtube";

export const fetchCommand: PluginCommand = async (args, ctx) => {
  const input = args[0];
  if (!input) throw new CommandError("Usage: eaiku catat fetch <youtube-url>", undefined, "USAGE");
  const videoId = parseVideoId(input);

  const [segments, meta, chapters] = await Promise.all([
    fetchCaptions(videoId),
    fetchOEmbed(videoId),
    fetchChapters(videoId),
  ]);
  const last = segments[segments.length - 1];
  const durationSec = Math.ceil(last.startSec + last.durSec);

  const transcript: TranscriptFile = {
    videoId,
    url: watchUrl(videoId),
    title: meta.title,
    channel: meta.channel,
    durationSec,
    captionLang: "en",
    chapters,
    segments,
    fetchedAt: new Date().toISOString(),
  };
  await ctx.storage.writeJson(`transcripts/${videoId}.json`, transcript);
  // Human-readable copy. The agent uses `eaiku catat read` instead of this file.
  await ctx.storage.writeText(`transcripts/${videoId}.txt`, toTranscriptText(groupLines(segments)));
  const draftsDir = await ctx.storage.ensureDir("drafts");

  return {
    videoId,
    url: transcript.url,
    title: transcript.title,
    channel: transcript.channel,
    durationSec,
    durationLabel: formatTimestamp(durationSec),
    captionLang: "en",
    chapters: chapters.map((c) => ({ ...c, label: formatTimestamp(c.startSec) })),
    transcriptPath: ctx.storage.path(`transcripts/${videoId}.txt`),
    draftsDir,
  };
};
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `pnpm vitest run plugins/catat && pnpm typecheck && pnpm lint`
Expected: all PASS, and typecheck and lint exit 0.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(catat): plan parts with a 5-minute buffer and add fetch, plan, and read commands"
```

---

### Task 13: CLI command `save`

**Files:**
- Create: `plugins/catat/cli/save.ts`
- Test: `plugins/catat/cli/save.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/catat/cli/save.test.ts`:

```ts
import fs from "node:fs";
import { createContext } from "@eaiku/core";
import { makeTempHome } from "@eaiku/core/testing";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../db";
import type { TranscriptFile } from "../lib/transcript";
import { makeLongTranscript, makeNote, transcript } from "../test/fixtures";
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
    const base = makeNote();
    if (base.source.type !== "youtube") throw new Error("fixture must be youtube");
    const note = makeNote({
      source: { ...base.source, durationSec: 1799, range: { startSec: 0, endSec: 1000 } },
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/cli/save.test.ts`
Expected: FAIL with "Cannot find module './save'".

- [ ] **Step 3: Implement**

`plugins/catat/cli/save.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { CommandError, type PluginCommand } from "@eaiku/core";
import { getSeriesParts, indexNote } from "../db";
import { checkCitations } from "../lib/citations";
import { checkSeriesRange, computePlan } from "../lib/plan";
import { Note } from "../schema/note";
import { loadTranscript } from "./shared";

export const WEB_BASE_URL = "http://localhost:3000";

export const saveCommand: PluginCommand = async (args, ctx) => {
  const input = args[0];
  if (!input) throw new CommandError("Usage: eaiku catat save <draft.json>", undefined, "USAGE");
  const draftPath = path.resolve(input);

  let json: unknown;
  try {
    json = JSON.parse(await fs.readFile(draftPath, "utf8"));
  } catch (error) {
    throw new CommandError(
      `Cannot read the draft as JSON: ${(error as Error).message}`,
      undefined,
      "INVALID_JSON",
    );
  }

  const parsed = Note.safeParse(json);
  if (!parsed.success) {
    throw new CommandError(
      "The note does not match the schema. Fix each issue and run save again.",
      { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      "SCHEMA_INVALID",
    );
  }
  const note = parsed.data;
  if (note.source.type !== "youtube") {
    throw new CommandError("v0.1 supports YouTube notes only.", undefined, "UNSUPPORTED_SOURCE");
  }

  const transcript = await loadTranscript(ctx, note.source.videoId);

  if (note.series) {
    const part = note.series.part;
    const plan = computePlan(transcript, getSeriesParts(ctx.db, note.series.id, note.id));
    const problem = checkSeriesRange(note, plan);
    if (problem) {
      throw new CommandError(
        problem,
        { plannedPart: plan.parts.find((p) => p.part === part) ?? null },
        "PLAN_MISMATCH",
      );
    }
  }

  const errors = checkCitations(note, transcript);
  if (errors.length > 0) {
    throw new CommandError(
      "Citation check failed. Fix each ref and run save again.",
      { errors },
      "CITATIONS_INVALID",
    );
  }

  const rel = `notes/${note.id}/note.json`;
  await ctx.storage.writeJson(rel, note);
  indexNote(ctx.db, note, ctx.storage.path(rel));

  // Only delete drafts that live in our drafts folder, never a user's file elsewhere.
  if (draftPath.startsWith(ctx.storage.path("drafts") + path.sep)) await fs.rm(draftPath);

  return { noteId: note.id, path: ctx.storage.path(rel), url: `${WEB_BASE_URL}/p/catat/${note.id}` };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run plugins/catat/cli && pnpm typecheck`
Expected: PASS (all tests in `cli/`), and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catat): add save command with schema, plan, and citation checks"
```

---

### Task 14: `reindex` command and the Catat manifest

**Files:**
- Create: `plugins/catat/cli/reindex.ts`, `plugins/catat/manifest.ts`
- Test: `plugins/catat/cli/reindex.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/catat/cli/reindex.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run plugins/catat/cli/reindex.test.ts`
Expected: FAIL with "Failed to resolve import ./reindex".

- [ ] **Step 3: Implement `reindex`**

`plugins/catat/cli/reindex.ts`:

```ts
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
```

`indexNote` opens its own transaction inside this one. better-sqlite3 turns nested transactions into savepoints, so this is safe.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run plugins/catat/cli/reindex.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the manifest**

`plugins/catat/manifest.ts`:

```ts
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
```

- [ ] **Step 6: Run all tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests PASS, and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(catat): add reindex command and plugin manifest"
```

---

### Task 15: The `eaiku` CLI

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/bin/eaiku.js`, `packages/cli/src/plugins.ts`, `packages/cli/src/run.ts`, `packages/cli/src/doctor.ts`, `packages/cli/src/main.ts`
- Test: `packages/cli/src/run.test.ts`

- [ ] **Step 1: Create the package**

`packages/cli/package.json`:

```json
{
  "name": "@eaiku/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "eaiku": "./bin/eaiku.js" },
  "dependencies": {
    "@eaiku/core": "workspace:*",
    "@eaiku/plugin-catat": "workspace:*"
  }
}
```

```bash
pnpm --filter @eaiku/cli add tsx
```

- [ ] **Step 2: Write the failing test**

`packages/cli/src/run.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/cli`
Expected: FAIL with "Failed to resolve import ./run".

- [ ] **Step 4: Implement**

`packages/cli/src/plugins.ts`:

```ts
import type { EaikuPlugin } from "@eaiku/core";
import { catat } from "@eaiku/plugin-catat";

// Add new plugins here. (Plan 02 generates the web app's list from plugins/*.)
export const plugins: EaikuPlugin[] = [catat];
```

`packages/cli/src/doctor.ts`:

```ts
import { createContext, type EaikuPlugin } from "@eaiku/core";

export async function runDoctor(plugins: EaikuPlugin[], home: string) {
  const checks: { plugin: string; label: string; ok: boolean; hint?: string }[] = [];
  for (const plugin of plugins) {
    const ctx = createContext(plugin, home);
    for (const check of plugin.healthChecks) {
      try {
        checks.push({ plugin: plugin.id, label: check.label, ...(await check.run(ctx)) });
      } catch (error) {
        checks.push({ plugin: plugin.id, label: check.label, ok: false, hint: (error as Error).message });
      }
    }
    ctx.db.close();
  }
  return { home, ok: checks.every((c) => c.ok), checks };
}
```

`packages/cli/src/run.ts`:

```ts
import { CommandError, createContext } from "@eaiku/core";
import { runDoctor } from "./doctor";
import { plugins } from "./plugins";

const USAGE = [
  "Usage:",
  "  eaiku <plugin> <command> [args]",
  "  eaiku reindex",
  "  eaiku doctor",
  `Plugins: ${plugins.map((p) => p.id).join(", ")}`,
].join("\n");

export async function run(argv: string[], home: string): Promise<unknown> {
  const [first, second, ...rest] = argv;
  if (!first || first === "--help" || first === "-h") throw new CommandError(USAGE, undefined, "USAGE");

  if (first === "doctor") return runDoctor(plugins, home);

  if (first === "reindex") {
    const results: Record<string, unknown> = {};
    for (const plugin of plugins) {
      const reindex = plugin.commands?.reindex;
      if (reindex) results[plugin.id] = await reindex([], createContext(plugin, home));
    }
    return results;
  }

  const plugin = plugins.find((p) => p.id === first);
  if (!plugin) throw new CommandError(`Unknown plugin "${first}".\n${USAGE}`, undefined, "USAGE");

  const commands = plugin.commands ?? {};
  const command = second ? commands[second] : undefined;
  if (!command) {
    throw new CommandError(
      `Unknown command "${second ?? ""}" for plugin "${plugin.id}". Commands: ${Object.keys(commands).join(", ")}`,
      undefined,
      "USAGE",
    );
  }
  return command(rest, createContext(plugin, home));
}
```

`packages/cli/src/main.ts`:

```ts
import { CommandError, resolveHome } from "@eaiku/core";
import { run } from "./run";

// Contract for agents: JSON result on stdout (exit 0), JSON error on stderr
// (exit 1 = expected CommandError the agent can fix, exit 2 = unexpected bug).
run(process.argv.slice(2), resolveHome()).then(
  (result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  },
  (error: unknown) => {
    if (error instanceof CommandError) {
      process.stderr.write(
        JSON.stringify({ error: { code: error.code, message: error.message, details: error.details } }, null, 2) + "\n",
      );
      process.exit(1);
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(JSON.stringify({ error: { code: "INTERNAL", message } }, null, 2) + "\n");
    process.exit(2);
  },
);
```

`packages/cli/bin/eaiku.js`:

```js
#!/usr/bin/env node
// Global entry for `eaiku`. Loads tsx from this package so it works from any folder.
import { register } from "tsx/esm/api";

register();
await import("../src/main.ts");
```

Make it executable: `chmod +x packages/cli/bin/eaiku.js`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli && pnpm typecheck`
Expected: PASS (3 tests), and typecheck exits 0.

- [ ] **Step 6: Link the global command and try it**

```bash
cd packages/cli && npm link && cd ../..
cd /tmp && EAIKU_HOME=/tmp/eaiku-try eaiku doctor
```

Expected: JSON with `"home": "/tmp/eaiku-try"` and two catat checks. "YouTube reachable" is `ok: true` when you are online. Then run `eaiku nope; echo "exit=$?"` and expect a JSON error on stderr and `exit=1`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cli): add the eaiku command with doctor and reindex"
```

---

### Task 16: The `/catat` Claude Code skill and marketplace

**Files:**
- Create: `plugins/catat/claude/.claude-plugin/plugin.json`, `plugins/catat/claude/skills/catat/SKILL.md`, `.claude-plugin/marketplace.json`, `README.md`

- [ ] **Step 1: Create the plugin and marketplace manifests**

`plugins/catat/claude/.claude-plugin/plugin.json`:

```json
{
  "name": "catat",
  "version": "0.1.0",
  "description": "Turn YouTube videos into eaiku notes that explain, not compress."
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "eaiku",
  "owner": { "name": "st-surjadi" },
  "plugins": [
    {
      "name": "catat",
      "source": "./plugins/catat/claude",
      "description": "Turn YouTube videos into eaiku notes that explain, not compress."
    }
  ]
}
```

- [ ] **Step 2: Write the skill**

`plugins/catat/claude/skills/catat/SKILL.md`:

````markdown
---
name: catat
description: Turn a YouTube video into an eaiku note that explains the content — hook, key takeaway, sections with analogies, key concepts, and open questions — with verified timestamp citations. Use when the user runs /catat or asks to take notes on a YouTube video.
---

# Catat: YouTube → eaiku note

Arguments: `<youtube-url> [--from m:ss --to m:ss] [--style friendly|textbook]`. Default style: `friendly`.

You do the thinking. The `eaiku` CLI does all YouTube access, validation, and saving. Never fetch YouTube yourself. Every CLI command prints JSON on stdout. On failure it prints `{"error": {code, message, details}}` on stderr and exits with code 1.

## 0. Preflight

Run `eaiku doctor`. If the command is not found, tell the user to run this once in the eaiku repo, then stop:

```
cd <eaiku-repo>/packages/cli && npm link
```

## 1. Fetch

Run `eaiku catat fetch "<url>"`. Keep `videoId`, `title`, `durationLabel`, and `draftsDir` from the output.

On error, explain it in one or two sentences and stop:
- `NO_CAPTIONS`: the video has no captions.
- `NO_ENGLISH_CAPTIONS`: show the available languages from the message. v0.1 supports English only.
- `BAD_URL`, `BLOCKED`, `EMPTY_TRANSCRIPT`, `FETCH_FAILED`: show the message.

## 2. Plan

- If the user gave `--from`/`--to`: make one note for that range, with **no** `series`. Go to step 3.
- Otherwise run `eaiku catat plan <videoId>`. Never read the whole transcript to plan.
  - `mode: "single"`: make one note for `parts[0]`, with **no** `series`. Go to step 3.
  - `mode: "chapters"` or `"grid"`: show the plan and wait for the user's choice:
    ```
    "<title>" is <durationLabel> long. I split it into <total> parts:
      1. 0:00–10:10  <title if any>  ✓ saved
      2. 10:10–19:55
      ...
    Make notes for: all / 1,2 / 1-3?
    ```
    Mark parts that have `savedNoteId` with ✓ and skip them unless the user asks to redo them. If there are more than 12 parts, show the first 10 and the last one. Suggest 3 parts or fewer for each run.

## 3. Write each note

Do the chosen parts **one at a time, in order**. For each part:

1. Read only this part: `eaiku catat read <videoId> --from <startLabel> --to <readUntilLabel>`. (For `--from`/`--to` notes, use the user's range.)
2. Set `source.range.startSec` to the part's `startSec`.
3. Set `source.range.endSec`:
   - `grid` mode: where the topic really ends. Pick the `[m:ss]` of the first line of the next topic, at or after `endSec` and not after `readUntilSec`. If the topic is still going at `readUntilSec`, use `readUntilSec`.
   - `chapters` and `single` modes: the part's `endSec`.
4. Set `series` for `chapters` and `grid` parts: `{ "id": "<videoId>", "part": <part>, "total": <total>, "partTitle": "<chapter title, or a short title you choose>" }`.
5. Write the draft with the Write tool to `<draftsDir>/<noteId>.json`, then save it (step 4).
6. Before the next part, run `eaiku catat plan <videoId>` again. The saved end moves the start of the next part.

### Writing guide: explain, do not compress

- **Hook** (max 280 chars): why should the reader care? Talk to the reader. No "In this video...".
- **Key takeaway** (max 280 chars): the one idea to remember, in plain words.
- **Sections** (3–8): each section teaches one idea. Explain *why*, not only *what*. Add an `analogy` where a real-world picture helps; skip it where it would feel forced. Body is Markdown (no HTML), 80–250 words.
- **Concepts** (3–12): terms a learner must know, each with a one or two sentence definition.
- **Open questions** (0–5): things the source *mentions but does not explain*. Each needs a `why`. Do not invent gaps. An empty list is fine.
- **Tags** (max 8): lowercase topic words.
- Auto-captions have no punctuation and have errors ("pie torch" = "PyTorch"). Fix words in your prose. **Never fix words inside a `quote`.**

Styles:
- `friendly`: warm, curious, short sentences, "you", everyday analogies, a little humor.
- `textbook`: neutral and precise, defined terms, no humor, analogies only when they help precision.

### Citations (checked by `save`)

- Every section and every concept needs at least one ref: `{ "kind": "timestamp", "startSec": <number>, "quote": "<exact words>" }`.
- `startSec` must be inside the note range. Use the `[m:ss]` of the transcript line you quote, converted to seconds.
- `quote`: 4–15 words copied **exactly** from the transcript, within 30 seconds of `startSec`. Case and punctuation do not matter; words do.

### Draft shape

- `id`: `<yyyy-mm-dd>-<kebab-title>`, and add `-p<part>` for series parts. Lowercase letters, digits, and dashes only.
- `createdAt`: current time in ISO 8601.
- `source`: `type: "youtube"`, `url`, `videoId`, `title`, `channel`, `durationSec`, `captionLang: "en"`, and `range: { startSec, endSec }`.
- `series` (only for a video split into parts): `{ id: <videoId>, part, total, partTitle }`.
- `generator`: `{ "agent": "claude-code", "model": "<your model id>", "promptVersion": "catat-v1" }`.

```json
{
  "schemaVersion": 1,
  "id": "2026-09-28-intro-to-llms-p2",
  "createdAt": "2026-09-28T10:00:00.000Z",
  "style": "friendly",
  "source": { "type": "youtube", "url": "https://www.youtube.com/watch?v=zjkBMFhNj_g", "videoId": "zjkBMFhNj_g", "title": "...", "channel": "...", "durationSec": 3588, "captionLang": "en", "range": { "startSec": 760, "endSec": 1445 } },
  "series": { "id": "zjkBMFhNj_g", "part": 2, "total": 6, "partTitle": "..." },
  "title": "...",
  "hook": "...",
  "keyTakeaway": "...",
  "sections": [{ "id": "kebab-id", "heading": "...", "body": "...", "analogy": "...", "refs": [{ "kind": "timestamp", "startSec": 772, "quote": "..." }] }],
  "concepts": [{ "term": "...", "definition": "...", "refs": [{ "kind": "timestamp", "startSec": 790, "quote": "..." }] }],
  "openQuestions": [{ "question": "...", "why": "..." }],
  "tags": ["..."],
  "generator": { "agent": "claude-code", "model": "...", "promptVersion": "catat-v1" }
}
```

## 4. Save

Run `eaiku catat save "<draft path>"`.

- `SCHEMA_INVALID`, `PLAN_MISMATCH`, or `CITATIONS_INVALID`: read the message and `details`, fix **only** the listed problems in the draft, and run `save` again. After **3** failed attempts, stop and show the remaining errors to the user.
- Success: tell the user the note title and the `url` from the output. For a series, list every saved part.
````

- [ ] **Step 3: Write the README setup section**

`README.md`:

````markdown
# eaiku

A local-first, forkable AI hub. Your own agent does the AI work; eaiku gives it plugins and a home for the results.

## Plugins

- **Catat**: `/catat <youtube-url>` turns a video into a note that explains, not compresses.

## Setup

Requirements: Node 22, pnpm, and Claude Code.

```bash
git clone <this repo> eaiku && cd eaiku
pnpm install
cd packages/cli && npm link && cd ../..   # puts `eaiku` on your PATH
eaiku doctor
```

In Claude Code, add this repo as a plugin marketplace and install Catat:

```
/plugin marketplace add /absolute/path/to/eaiku
/plugin install catat@eaiku
```

Then run `/catat https://www.youtube.com/watch?v=...`.

Notes are saved in `~/eaiku` (change it with `EAIKU_HOME`). If the database ever breaks, run `eaiku reindex`.

## Troubleshooting

- `better-sqlite3` fails to install: use Node 22 (`nvm use`) and run `pnpm rebuild better-sqlite3`.
````

- [ ] **Step 4: Install the plugin in Claude Code and check it loads**

In Claude Code, run:

```
/plugin marketplace add /Users/stevenseansurjadi/code/eaiku
/plugin install catat@eaiku
```

Restart Claude Code if asked. Type `/catat`. Expected: the skill shows in the menu. It may show as `/catat` or as `/catat:catat`; both are fine. Write down the exact name in the README if it differs.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catat): add the /catat Claude Code skill and marketplace"
```

---

### Task 17: End-to-end check on real videos

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-eaiku-v0.1-design.md` (section 15, results)

- [ ] **Step 1: Run the full automatic checks**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all exit 0.

- [ ] **Step 2: Short video (≤ 10 min)**

Pick a video of 10 minutes or less. Check its length first with `pnpm tsx plugins/catat/scripts/preview.ts '<url>' 1`.
In Claude Code: `/catat '<url>'`
Expected: `plan` returns `mode: "single"`, there is no plan question, and one note is saved. Check: `ls ~/eaiku/catat/notes/` shows the note folder.

- [ ] **Step 3: Long video with chapters**

In Claude Code: `/catat https://www.youtube.com/watch?v=zjkBMFhNj_g`. Answer `1` to the plan question.
Expected: `mode: "chapters"` with 21 parts and the chapter titles. One part note with `series.part = 1` is saved.

- [ ] **Step 3b: Long video without chapters (grid and buffer)**

In Claude Code: `/catat https://www.youtube.com/watch?v=reDRM0tqhNs` (12:38:38, no chapters). Answer `1-2`.
Expected:
- The plan shows about 76 parts (the first 10 and the last one) with no titles.
- Part 1 ends between its planned end and its `readUntilLabel` (at most 5 minutes later).
- The second `plan` run shows part 1 with ✓, and part 2 starts exactly at part 1's saved end.
- Check: `sqlite3 ~/eaiku/eaiku.db "SELECT part, start_sec, end_sec FROM catat_notes WHERE series_id = 'reDRM0tqhNs' ORDER BY part"` shows 2 rows, and row 2 `start_sec` equals row 1 `end_sec`.

- [ ] **Step 4: Manual range**

In Claude Code: `/catat https://www.youtube.com/watch?v=kCc8FmEb1nY --from 12:00 --to 24:00`
Expected: one note with `source.range` = `{ startSec: 720, endSec: 1440 }`.

- [ ] **Step 5: Check the index**

Run: `eaiku reindex`
Expected: `{"catat": {"indexed": 5, "skipped": []}}`.

- [ ] **Step 6: Read the five notes**

Open each `note.json`. For the grid parts, check that each part ends at a natural topic break. Check by eye: the hook is not "In this video…", the sections explain *why*, and the analogies fit. Write down any problems as prompt changes for `SKILL.md`, and apply them before you commit.

- [ ] **Step 7: Record the results and commit**

Add the results of Task 8 Step 7 and this task to spec section 15.

```bash
git add -A
git commit -m "docs: record Day 1 and end-to-end check results"
```

---

## After this plan

- **Plan 02 (web app):** Next.js app with Turborepo, landing page (CSS 3D "EAIKU" text), Plugins page, notes list with FTS search, and note page. Adds `pages` to `EaikuPlugin`.
- **Plan 03 (demo and release):** demo data, static export to eaiku.com on Cloudflare Pages, README GIF, merge `feat/v0.1` into `main` to release `v0.1.0`.
