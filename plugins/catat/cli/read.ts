import { parseArgs } from "node:util";
import { CommandError, type PluginCommand } from "@eaiku/core";
import { formatTimestamp, parseTimestamp } from "../lib/time";
import { groupLines, toTranscriptText } from "../lib/transcript";
import { loadTranscript } from "./shared";

// Returns only the transcript lines of one range, so the agent never loads a whole long video.
export const readCommand: PluginCommand = async (args, ctx) => {
  const { values, positionals } = parseArgs({
    args,
    options: { from: { type: "string" }, to: { type: "string" } },
    allowPositionals: true,
  });
  const input = positionals[0];
  if (!input) {
    throw new CommandError("Usage: eaiku catat read <videoId> [--from m:ss] [--to m:ss]", undefined, "USAGE");
  }
  const transcript = await loadTranscript(ctx, input);
  const fromSec = values.from ? parseTimestamp(values.from) : 0;
  const toSec = values.to ? parseTimestamp(values.to) : transcript.durationSec;
  const segments = transcript.segments.filter((s) => s.startSec >= fromSec && s.startSec < toSec);

  return {
    videoId: transcript.videoId,
    from: formatTimestamp(fromSec),
    to: formatTimestamp(toSec),
    text: toTranscriptText(groupLines(segments)),
  };
};
