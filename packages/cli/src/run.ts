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
