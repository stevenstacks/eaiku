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
