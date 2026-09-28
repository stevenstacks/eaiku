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
