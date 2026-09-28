import { CommandError, type PluginCommand } from "@eaiku/core";
import { formatTimestamp } from "../lib/time";
import { groupLines, toTranscriptText, type TranscriptFile } from "../lib/transcript";
import { parseVideoId } from "../lib/video-id";
import { fetchCaptions, fetchChapters, fetchOEmbed, watchUrl } from "../lib/youtube";

export const fetchCommand: PluginCommand = async (args, ctx) => {
  const input = args[0];
  if (!input) throw new CommandError("Usage: eaiku catat fetch <youtube-url>", undefined, "USAGE");
  const videoId = parseVideoId(input);

  const [segments, meta, chapters] = await Promise.all([
    fetchCaptions(videoId),
    fetchOEmbed(videoId),
    fetchChapters(videoId),
  ]);
  const last = segments[segments.length - 1];
  const durationSec = Math.ceil(last.startSec + last.durSec);

  const transcript: TranscriptFile = {
    videoId,
    url: watchUrl(videoId),
    title: meta.title,
    channel: meta.channel,
    durationSec,
    captionLang: "en",
    chapters,
    segments,
    fetchedAt: new Date().toISOString(),
  };
  await ctx.storage.writeJson(`transcripts/${videoId}.json`, transcript);
  // Human-readable copy. The agent uses `eaiku catat read` instead of this file.
  await ctx.storage.writeText(`transcripts/${videoId}.txt`, toTranscriptText(groupLines(segments)));
  const draftsDir = await ctx.storage.ensureDir("drafts");

  return {
    videoId,
    url: transcript.url,
    title: transcript.title,
    channel: transcript.channel,
    durationSec,
    durationLabel: formatTimestamp(durationSec),
    captionLang: "en",
    chapters: chapters.map((c) => ({ ...c, label: formatTimestamp(c.startSec) })),
    transcriptPath: ctx.storage.path(`transcripts/${videoId}.txt`),
    draftsDir,
  };
};
