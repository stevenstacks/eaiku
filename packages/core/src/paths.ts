import os from "node:os";
import path from "node:path";

export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.EAIKU_HOME;
  if (value) return path.resolve(value.replace(/^~(?=$|\/)/, os.homedir()));
  return path.join(os.homedir(), "eaiku");
}
