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
