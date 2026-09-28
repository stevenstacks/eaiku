// Live check against YouTube. Run by hand; not part of `pnpm test`.
import { fetchCaptions, fetchChapters, fetchOEmbed } from "../lib/youtube";

const VIDEO_IDS = [
  "aircAruvnKk", // 3Blue1Brown, many caption languages
  "wjZofJX0v4M", // 3Blue1Brown
  "kCc8FmEb1nY", // Karpathy, ~2h
  "zjkBMFhNj_g", // Karpathy, ~1h
  "zduSFxRajkE", // Karpathy, tokenizer
  "7xTGNNLPyMI", // Karpathy, ~3.5h
  "8jPQjjsBbIc", // TED talk
  "arj7oStGLkU", // TED talk
  "UF8uR6Z6KLc", // Stanford speech
  "dQw4w9WgXcQ", // music video
];

for (const id of VIDEO_IDS) {
  const [meta, chapters, captions] = await Promise.allSettled([
    fetchOEmbed(id),
    fetchChapters(id),
    fetchCaptions(id),
  ]);
  console.log(
    id.padEnd(12),
    meta.status === "fulfilled" ? meta.value.title.slice(0, 40).padEnd(40) : "oEmbed FAILED".padEnd(40),
    chapters.status === "fulfilled" ? `chapters=${chapters.value.length}`.padEnd(12) : "chapters=ERR",
    captions.status === "fulfilled"
      ? `segments=${captions.value.length} first="${captions.value[0]?.text.slice(0, 30)}"`
      : `captions ERROR ${(captions.reason as Error).message.slice(0, 80)}`,
  );
}
