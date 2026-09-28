import type { Chapter } from "./transcript";

const CHAPTER =
  /"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeRangeStartMillis":(\d+)/g;

// Best effort: YouTube does not document this page data. Returns [] when not found.
export function parseChapters(html: string): Chapter[] {
  const seen = new Set<number>();
  const chapters: Chapter[] = [];
  for (const match of html.matchAll(CHAPTER)) {
    const startSec = Number(match[2]) / 1000;
    if (seen.has(startSec)) continue;
    seen.add(startSec);
    chapters.push({ title: JSON.parse(`"${match[1]}"`) as string, startSec });
  }
  return chapters.sort((a, b) => a.startSec - b.startSec);
}
