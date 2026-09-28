import { CommandError, type PluginContext } from "@eaiku/core";
import type { TranscriptFile } from "../lib/transcript";
import { parseVideoId } from "../lib/video-id";

export async function loadTranscript(ctx: PluginContext, videoIdOrUrl: string): Promise<TranscriptFile> {
  const videoId = parseVideoId(videoIdOrUrl);
  const transcript = await ctx.storage.readJson<TranscriptFile>(`transcripts/${videoId}.json`);
  if (!transcript) {
    throw new CommandError(
      `No transcript for ${videoId}. Run "eaiku catat fetch <url>" first.`,
      undefined,
      "NOT_FETCHED",
    );
  }
  return transcript;
}
