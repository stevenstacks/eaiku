import type { Segment } from "./transcript";

export interface Part {
  part: number;
  startSec: number;
  endSec: number;
  title?: string;
}

// Moves a cut to the segment start with the longest pause before it, within ±windowSec.
// Ties go to the start closest to the original cut.
export function snapCut(segments: Segment[], cutSec: number, windowSec = 120): number {
  let best = cutSec;
  let bestGap = -Infinity;
  let bestDistance = Infinity;

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const start = segments[i].startSec;
    const distance = Math.abs(start - cutSec);
    if (distance > windowSec) continue;
    const gap = start - (prev.startSec + prev.durSec);
    if (gap > bestGap || (gap === bestGap && distance < bestDistance)) {
      best = start;
      bestGap = gap;
      bestDistance = distance;
    }
  }
  return best;
}

export function buildParts(cuts: number[], durationSec: number): Part[] {
  const points = [...new Set(cuts.filter((c) => c > 0 && c < durationSec))].sort((a, b) => a - b);
  const edges = [0, ...points, durationSec];
  return edges.slice(0, -1).map((startSec, i) => ({ part: i + 1, startSec, endSec: edges[i + 1] }));
}
