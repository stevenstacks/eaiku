import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a kebab-case slug");

// `quote` holds exact words from the source. `save` checks it against the transcript.
const quote = z.string().max(200).optional();

export const SourceRef = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("timestamp"),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative().optional(),
    quote,
  }),
  z.object({ kind: z.literal("page"), page: z.number().int().positive(), quote }),
  z.object({ kind: z.literal("chapter"), chapter: z.string(), page: z.number().int().optional(), quote }),
]);

export const Source = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("youtube"),
    url: z.url(),
    videoId: z.string(),
    title: z.string(),
    channel: z.string().optional(),
    durationSec: z.number().positive(),
    captionLang: z.string(),
    range: z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive() }),
  }),
  z.object({ type: z.literal("pdf"), fileName: z.string(), title: z.string(), pageCount: z.number() }),
  z.object({ type: z.literal("epub"), fileName: z.string(), title: z.string(), author: z.string().optional() }),
]);

export const Section = z.object({
  id: slug,
  heading: z.string().max(80),
  body: z.string().min(1), // Markdown, no raw HTML
  analogy: z.string().optional(),
  refs: z.array(SourceRef).min(1),
});

export const Concept = z.object({
  term: z.string().min(1),
  definition: z.string().max(300),
  refs: z.array(SourceRef).min(1),
});

export const Note = z.object({
  schemaVersion: z.literal(1),
  id: slug,
  createdAt: z.iso.datetime(),
  style: z.enum(["friendly", "textbook"]),
  source: Source,
  series: z
    .object({
      id: z.string(),
      part: z.number().int().positive(),
      total: z.number().int().positive(),
      partTitle: z.string(),
    })
    .optional(),
  title: z.string().min(1),
  hook: z.string().max(280),
  keyTakeaway: z.string().max(280),
  sections: z.array(Section).min(3).max(8),
  concepts: z.array(Concept).min(3).max(12),
  openQuestions: z.array(z.object({ question: z.string(), why: z.string() })).max(5),
  tags: z.array(z.string()).max(8),
  generator: z.object({
    agent: z.literal("claude-code"),
    model: z.string().optional(),
    promptVersion: z.string(),
  }),
});

export type Note = z.infer<typeof Note>;
export type SourceRef = z.infer<typeof SourceRef>;
