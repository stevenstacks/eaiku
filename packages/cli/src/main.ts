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
