// Shows what the agent will read for a video: title, chapters, and the first transcript lines.
// Usage: pnpm tsx plugins/catat/scripts/preview.ts <youtube-url> [lines]
import { formatTimestamp } from "../lib/time";
import { groupLines, toTranscriptText } from "../lib/transcript";
import { parseVideoId } from "../lib/video-id";
import { fetchCaptions, fetchChapters, fetchOEmbed } from "../lib/youtube";

const [input, lineCount = "15"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: pnpm tsx plugins/catat/scripts/preview.ts <youtube-url> [lines]");
  process.exit(1);
}

const videoId = parseVideoId(input);
const [meta, chapters, segments] = await Promise.all([
  fetchOEmbed(videoId),
  fetchChapters(videoId),
  fetchCaptions(videoId),
]);
const last = segments[segments.length - 1];
const lines = groupLines(segments);

console.log(`${meta.title} — ${meta.channel ?? "unknown channel"}`);
console.log(`Duration ${formatTimestamp(last.startSec + last.durSec)}, ${segments.length} caption segments → ${lines.length} lines`);
console.log(`Chapters (${chapters.length}):`);
for (const c of chapters) console.log(`  ${formatTimestamp(c.startSec).padStart(7)}  ${c.title}`);
console.log(`\nFirst ${lineCount} transcript lines:\n`);
console.log(toTranscriptText(lines.slice(0, Number(lineCount))));
