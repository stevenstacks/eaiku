import type { Note, SourceRef } from "../schema/note";
import { formatTimestamp } from "./time";
import type { TranscriptFile } from "./transcript";

export interface CitationError {
  path: string;
  message: string;
}

const QUOTE_TOLERANCE_SEC = 30;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function allRefs(note: Note): { path: string; ref: SourceRef }[] {
  return [
    ...note.sections.flatMap((s, i) => s.refs.map((ref, j) => ({ path: `sections[${i}].refs[${j}]`, ref }))),
    ...note.concepts.flatMap((c, i) => c.refs.map((ref, j) => ({ path: `concepts[${i}].refs[${j}]`, ref }))),
  ];
}

export function checkCitations(
  note: Note,
  transcript: Pick<TranscriptFile, "durationSec" | "segments">,
): CitationError[] {
  if (note.source.type !== "youtube") {
    return [{ path: "source.type", message: "v0.1 supports YouTube notes only." }];
  }
  const { range } = note.source;
  const errors: CitationError[] = [];

  if (range.startSec >= range.endSec || range.endSec > transcript.durationSec + 1) {
    errors.push({
      path: "source.range",
      message: `Range ${formatTimestamp(range.startSec)}–${formatTimestamp(range.endSec)} must be inside the video (0:00–${formatTimestamp(transcript.durationSec)}) and start before it ends.`,
    });
    return errors;
  }

  const rangeLabel = `${formatTimestamp(range.startSec)}–${formatTimestamp(range.endSec)}`;

  for (const { path, ref } of allRefs(note)) {
    if (ref.kind !== "timestamp") {
      errors.push({ path, message: `YouTube notes must use "timestamp" refs, not "${ref.kind}".` });
      continue;
    }
    const outside = (sec: number) => sec < range.startSec || sec > range.endSec;
    if (outside(ref.startSec) || (ref.endSec !== undefined && (outside(ref.endSec) || ref.endSec < ref.startSec))) {
      errors.push({ path, message: `Timestamp ${formatTimestamp(ref.startSec)} is outside the note range ${rangeLabel}.` });
      continue;
    }
    if (ref.quote === undefined) continue;

    const wanted = normalize(ref.quote);
    const nearby = transcript.segments
      .filter(
        (s) =>
          s.startSec + s.durSec >= ref.startSec - QUOTE_TOLERANCE_SEC &&
          s.startSec <= ref.startSec + QUOTE_TOLERANCE_SEC,
      )
      .map((s) => s.text)
      .join(" ");
    if (!wanted || !normalize(nearby).includes(wanted)) {
      errors.push({
        path,
        message: `Quote "${ref.quote}" not found in the transcript near ${formatTimestamp(ref.startSec)} (±${QUOTE_TOLERANCE_SEC}s). Copy the exact words from the transcript.`,
      });
    }
  }
  return errors;
}
