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
