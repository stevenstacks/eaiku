import type { SavedPart } from "../db";
import type { Note } from "../schema/note";
import { buildParts, snapCut, type Part } from "./snap";
import { formatTimestamp } from "./time";
import type { TranscriptFile } from "./transcript";

export const SINGLE_MAX_SEC = 600;
export const GRID_SEC = 600;
export const BUFFER_SEC = 300;
export const SNAP_WINDOW_SEC = 120;

export interface PlannedPart {
  part: number;
  startSec: number;
  endSec: number; // planned end
  readUntilSec: number; // planned end + buffer; the note may end anywhere up to here
  title?: string;
  savedNoteId?: string;
}

export interface Plan {
  mode: "single" | "chapters" | "grid";
  total: number;
  parts: PlannedPart[];
}

type PlanInput = Pick<TranscriptFile, "durationSec" | "segments" | "chapters">;

function baseParts(t: PlanInput): { mode: Plan["mode"]; bufferSec: number; parts: Part[] } {
  if (t.durationSec <= SINGLE_MAX_SEC) {
    return { mode: "single", bufferSec: 0, parts: [{ part: 1, startSec: 0, endSec: t.durationSec }] };
  }
  if (t.chapters.length >= 2) {
    const parts = buildParts(
      t.chapters.map((c) => c.startSec),
      t.durationSec,
    ).map((p) => ({ ...p, title: t.chapters.find((c) => c.startSec === p.startSec)?.title }));
    return { mode: "chapters", bufferSec: 0, parts };
  }
  // Stop half a grid step before the end, so the last part is never shorter than 5 minutes.
  const cuts: number[] = [];
  for (let c = GRID_SEC; c < t.durationSec - GRID_SEC / 2; c += GRID_SEC) {
    cuts.push(snapCut(t.segments, c, SNAP_WINDOW_SEC));
  }
  return { mode: "grid", bufferSec: BUFFER_SEC, parts: buildParts(cuts, t.durationSec) };
}

export function computePlan(t: PlanInput, saved: SavedPart[] = []): Plan {
  const { mode, bufferSec, parts } = baseParts(t);
  const savedByPart = new Map(saved.map((s) => [s.part, s]));

  let previousEnd = 0;
  const planned = parts.map((p): PlannedPart => {
    const s = savedByPart.get(p.part);
    if (s) {
      previousEnd = s.endSec;
      return { ...p, startSec: s.startSec, endSec: s.endSec, readUntilSec: s.endSec, savedNoteId: s.id };
    }
    // A saved previous part may have used its buffer. Start where it really ended.
    const startSec = previousEnd > p.startSec && previousEnd < p.endSec ? previousEnd : p.startSec;
    previousEnd = p.endSec;
    return { ...p, startSec, readUntilSec: Math.min(p.endSec + bufferSec, t.durationSec) };
  });
  return { mode, total: planned.length, parts: planned };
}

// Returns a message when a series note does not match the plan, or null when it does.
export function checkSeriesRange(note: Note, plan: Plan): string | null {
  if (!note.series || note.source.type !== "youtube") return null;
  const { series } = note;
  const { range, videoId } = note.source;

  if (series.id !== videoId) return `series.id must be the videoId "${videoId}".`;
  if (series.total !== plan.total) return `series.total must be ${plan.total}.`;
  const part = plan.parts.find((p) => p.part === series.part);
  if (!part) return `Part ${series.part} does not exist. The plan has ${plan.total} parts.`;
  if (Math.abs(range.startSec - part.startSec) > 1) {
    return `Part ${series.part} must start at ${formatTimestamp(part.startSec)} (${part.startSec}s).`;
  }
  if (range.endSec > part.readUntilSec + 1) {
    return `Part ${series.part} must end at or before ${formatTimestamp(part.readUntilSec)} (${part.readUntilSec}s).`;
  }
  return null;
}
