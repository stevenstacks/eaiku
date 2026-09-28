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
