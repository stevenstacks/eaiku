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
