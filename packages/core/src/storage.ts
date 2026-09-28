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
