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
