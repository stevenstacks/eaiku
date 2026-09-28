import { formatTimestamp } from "./time";

export interface Segment {
  startSec: number;
  durSec: number;
  text: string;
}

export interface Chapter {
  title: string;
  startSec: number;
}

// Stored at <home>/catat/transcripts/<videoId>.json
export interface TranscriptFile {
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  durationSec: number;
  captionLang: string;
  chapters: Chapter[];
  segments: Segment[];
  fetchedAt: string;
}

export interface Line {
  startSec: number;
  endSec: number;
  text: string;
}

// Shape returned by the youtube-transcript package (offset and duration in ms).
export interface RawCaption {
  text: string;
  duration: number;
  offset: number;
}

export function decodeEntities(input: string): string {
  let text = input;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/&amp;/g, "&");
  } while (text !== previous);
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function toSegments(raw: RawCaption[]): Segment[] {
  return raw.map((c) => ({
    startSec: c.offset / 1000,
    durSec: c.duration / 1000,
    text: decodeEntities(c.text).replace(/\s+/g, " ").trim(),
  }));
}

// Joins caption fragments into readable lines. A line ends at a sentence end
// once it has minChars, or at maxChars (auto-captions have no punctuation).
export function groupLines(segments: Segment[], maxChars = 220, minChars = 80): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const endSec = seg.startSec + seg.durSec;
    if (current) {
      current.text += " " + text;
      current.endSec = endSec;
    } else {
      current = { startSec: seg.startSec, endSec, text };
    }

    const endsSentence = /[.?!]["')\]]?$/.test(current.text);
    if ((endsSentence && current.text.length >= minChars) || current.text.length >= maxChars) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function toTranscriptText(lines: Line[]): string {
  return lines.map((l) => `[${formatTimestamp(l.startSec)}] ${l.text}`).join("\n") + "\n";
}
