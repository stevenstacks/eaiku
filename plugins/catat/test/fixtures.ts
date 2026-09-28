import type { Note } from "../schema/note";
import type { Segment, TranscriptFile } from "../lib/transcript";

export const segments: Segment[] = [
  { startSec: 0, durSec: 4, text: "welcome to this short lesson about tokens" },
  { startSec: 4, durSec: 5, text: "a tokenizer splits text into small pieces" },
  { startSec: 9, durSec: 5, text: "each piece is mapped to a number" },
  { startSec: 40, durSec: 5, text: "the model only ever sees those numbers" },
  { startSec: 70, durSec: 6, text: "that is why spelling tasks can be hard" },
];

export const transcript: TranscriptFile = {
  videoId: "abcdefghijk",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  title: "Tokens 101",
  channel: "Demo Channel",
  durationSec: 80,
  captionLang: "en",
  chapters: [],
  segments,
  fetchedAt: "2026-09-28T10:00:00.000Z",
};

const ref = (startSec: number, quote: string) => ({ kind: "timestamp" as const, startSec, quote });

type YoutubeSource = Extract<Note["source"], { type: "youtube" }>;

export function youtubeSource(overrides: Partial<YoutubeSource> = {}): YoutubeSource {
  return {
    type: "youtube",
    url: transcript.url,
    videoId: transcript.videoId,
    title: transcript.title,
    channel: transcript.channel,
    durationSec: 80,
    captionLang: "en",
    range: { startSec: 0, endSec: 80 },
    ...overrides,
  };
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    schemaVersion: 1,
    id: "2026-09-28-tokens-101",
    createdAt: "2026-09-28T10:00:00.000Z",
    style: "friendly",
    source: youtubeSource(),
    title: "Tokens 101: how models read text",
    hook: "Your chatbot cannot see letters. Here is why that matters.",
    keyTakeaway: "Models read numbers that stand for pieces of text, not letters.",
    sections: [
      {
        id: "what-a-tokenizer-does",
        heading: "What a tokenizer does",
        body: "A tokenizer cuts text into small pieces.",
        analogy: "Like cutting a pizza into slices before you share it.",
        refs: [ref(4, "A tokenizer splits text")],
      },
      {
        id: "pieces-become-numbers",
        heading: "Pieces become numbers",
        body: "Each piece gets an ID number.",
        refs: [ref(9, "mapped to a number")],
      },
      {
        id: "why-spelling-is-hard",
        heading: "Why spelling is hard",
        body: "The model never sees single letters.",
        refs: [ref(70, "spelling tasks can be hard")],
      },
    ],
    concepts: [
      { term: "Token", definition: "A small piece of text.", refs: [ref(4, "small pieces")] },
      { term: "Tokenizer", definition: "The tool that splits text.", refs: [ref(4, "tokenizer splits")] },
      { term: "Token ID", definition: "The number for a token.", refs: [ref(40, "only ever sees those numbers")] },
    ],
    openQuestions: [
      {
        question: "How is the vocabulary chosen?",
        why: "The video mentions a vocabulary but does not explain how it is built.",
      },
    ],
    tags: ["llm", "tokens"],
    generator: { agent: "claude-code", promptVersion: "catat-v1" },
    ...overrides,
  };
}

// 29:59 of 4-second segments every 5 seconds (1-second pauses), with two longer pauses:
// 4 seconds before 10:10 and 3 seconds before 19:55. No chapters.
export function makeLongTranscript(): TranscriptFile {
  const long: Segment[] = [];
  for (let t = 0; t < 1800; t += 5) {
    long.push({ startSec: t, durSec: t === 605 ? 1 : t === 1190 ? 2 : 4, text: `line at ${t}` });
  }
  return { ...transcript, durationSec: 1799, chapters: [], segments: long };
}
