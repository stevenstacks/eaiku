import { CommandError, type PluginCommand } from "@eaiku/core";
import { getSeriesParts } from "../db";
import { computePlan } from "../lib/plan";
import { formatTimestamp } from "../lib/time";
import { loadTranscript } from "./shared";

export const planCommand: PluginCommand = async (args, ctx) => {
  const input = args[0];
  if (!input) throw new CommandError("Usage: eaiku catat plan <videoId>", undefined, "USAGE");
  const transcript = await loadTranscript(ctx, input);
  const plan = computePlan(transcript, getSeriesParts(ctx.db, transcript.videoId));

  return {
    videoId: transcript.videoId,
    title: transcript.title,
    durationLabel: formatTimestamp(transcript.durationSec),
    mode: plan.mode,
    total: plan.total,
    parts: plan.parts.map((p) => ({
      ...p,
      startLabel: formatTimestamp(p.startSec),
      endLabel: formatTimestamp(p.endSec),
      readUntilLabel: formatTimestamp(p.readUntilSec),
    })),
  };
};
